import { createHmac } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { OAuthTokens } from '@/modules/providers/types';

export type OlistAccountBinding = { fingerprint: string; sourceGeneration: number };
const OLIST_ACCOUNT_API_BASE = new URL('https://api.tiny.com.br/public-api/v3/');
const OLIST_BINDING_DB_MAX_WAIT_MS = 10_000;
type PendingTokens = {
  credentialVersion: string;
  tokens: OAuthTokens;
  sourceGeneration?: number;
  signal?: AbortSignal;
  deadlineAt?: number;
};

export function fingerprintOlistAccount(cpfCnpj: string): string {
  const encoded = process.env.OLIST_ACCOUNT_FINGERPRINT_KEY;
  if (!encoded) throw new Error('olist_account_fingerprint_key_invalid');
  let key: Buffer;
  try { key = Buffer.from(encoded, 'base64'); } catch { throw new Error('olist_account_fingerprint_key_invalid'); }
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('olist_account_fingerprint_key_invalid');
  return createHmac('sha256', key).update(cpfCnpj.replace(/\D/g, '')).digest('hex');
}

/** Fixed provider origin and prefix; relative construction cannot escape v3. */
export function olistAccountInfoUrl(): URL {
  const url = new URL('info', OLIST_ACCOUNT_API_BASE);
  if (url.origin !== OLIST_ACCOUNT_API_BASE.origin || !url.pathname.startsWith(OLIST_ACCOUNT_API_BASE.pathname)) {
    throw new Error('olist_path_invalid');
  }
  return url;
}

/** Network /info is deliberately outside the lock; publication is a single credential-CAS transaction. */
export async function loadAndBindOlistAccount(orgId: string, pending?: PendingTokens): Promise<OlistAccountBinding> {
  const { credentialVersion, getOlistPublicationContext, getProviderOAuthCredentials, getValidAccessTokenForProvider } = await import('@/modules/connections/provider-connection.repository');
  const credentials = await getProviderOAuthCredentials(orgId, 'olist');
  if (pending && pending.credentialVersion !== credentials.version) throw new Error('olist_conta_nao_validada');
  if (pending?.signal?.aborted || (pending?.deadlineAt !== undefined && pending.deadlineAt <= Date.now())) throw new Error('olist_deadline_exceeded');
  // Capture the monotonic generation before /info. A later callback can only
  // publish if no other callback/credential rotation changed this exact row.
  const publication = await getOlistPublicationContext(orgId);
  if (publication.credentialVersion !== credentials.version || (pending?.sourceGeneration !== undefined && pending.sourceGeneration !== publication.dataGeneration)) throw new Error('olist_conta_nao_validada');
  const accessToken = pending?.tokens.accessToken ?? await getValidAccessTokenForProvider(orgId, 'olist', 0);
  const timeout = AbortSignal.timeout(Math.max(0, Math.min(10_000, pending?.deadlineAt === undefined ? 10_000 : pending.deadlineAt - Date.now())));
  const response = await fetch(olistAccountInfoUrl(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: pending?.signal ? AbortSignal.any([pending.signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error('olist_conta_nao_validada');
  const body: unknown = await response.json();
  const value = typeof body === 'object' && body !== null ? (body as { cpfCnpj?: unknown; cpf_cnpj?: unknown }).cpfCnpj ?? (body as { cpf_cnpj?: unknown }).cpf_cnpj : undefined;
  if (typeof value !== 'string') throw new Error('olist_conta_nao_validada');
  const fingerprint = fingerprintOlistAccount(value);
  const [{ encryptConnectionSecret }, { olistBindingDb }] = await Promise.all([
    import('@/modules/connections/connection-secrets'),
    import('@/db/olist-client'),
  ]);
  return olistBindingDb.transaction(async (tx) => {
    ensureBindingActive(pending);
    await setBindingTimeouts(tx, pending);
    const locked = await tx.execute(sql`SELECT id, oauth_client_id, oauth_client_secret, data_generation FROM connections WHERE org_id=${orgId} AND provider='olist' FOR UPDATE`);
    const row = locked[0] as { id?: string; oauth_client_id?: string; oauth_client_secret?: string; data_generation?: number } | undefined;
    if (!row?.id || !row.oauth_client_id || !row.oauth_client_secret || credentialVersion(row.oauth_client_id, row.oauth_client_secret) !== credentials.version || row.data_generation !== publication.dataGeneration) throw new Error('olist_conta_nao_validada');
    const now = new Date();
    // Raw SQL parameters do not inherit Drizzle column encoders. Serialize Date
    // values explicitly so postgres-js receives canonical timestamptz strings.
    const expiresAt = new Date(now.getTime() + (pending?.tokens.expiresInSeconds ?? 0) * 1000).toISOString();
    const refreshExpiresAt = new Date(now.getTime() + (pending?.tokens.refreshExpiresInSeconds ?? 86_400) * 1000).toISOString();
    const refreshedAt = now.toISOString();
    const tokenSet = pending ? sql`, access_token=${encryptConnectionSecret({ orgId, provider: 'olist', kind: 'access_token', value: pending.tokens.accessToken })}, refresh_token=${encryptConnectionSecret({ orgId, provider: 'olist', kind: 'refresh_token', value: pending.tokens.refreshToken })}, expira_em=${expiresAt}::timestamptz, refresh_expira_em=${refreshExpiresAt}::timestamptz, last_refresh_at=${refreshedAt}::timestamptz, last_error_code=NULL, last_error_at=NULL, status='ok'` : sql``;
    ensureBindingActive(pending);
    await setBindingTimeouts(tx, pending);
    const applied = await tx.execute(sql`UPDATE connections SET provider_account_fingerprint=${fingerprint}, data_generation=data_generation+1, updated_at=clock_timestamp() ${tokenSet} WHERE id=${row.id} AND oauth_client_id=${row.oauth_client_id} AND oauth_client_secret=${row.oauth_client_secret} AND data_generation=${publication.dataGeneration} RETURNING data_generation`);
    const generation = (applied[0] as { data_generation?: number } | undefined)?.data_generation;
    if (!generation) throw new Error('olist_conta_nao_validada');
    // A new generation cannot reuse readiness from the prior generation.
    ensureBindingActive(pending);
    await setBindingTimeouts(tx, pending);
    await tx.execute(sql`DELETE FROM connection_sync_state WHERE org_id=${orgId} AND provider='olist'`);
    // These checks remain inside the transaction so an abort after either write
    // rolls back the publication instead of committing stale credentials.
    ensureBindingActive(pending);
    return { fingerprint, sourceGeneration: generation };
  });
}

function ensureBindingActive(pending?: PendingTokens): void {
  if (pending?.signal?.aborted || (pending?.deadlineAt !== undefined && pending.deadlineAt <= Date.now())) {
    throw new Error('olist_deadline_exceeded');
  }
}

function bindingTimeoutMs(pending?: PendingTokens): number {
  ensureBindingActive(pending);
  const remaining = pending?.deadlineAt === undefined ? OLIST_BINDING_DB_MAX_WAIT_MS : pending.deadlineAt - Date.now();
  return Math.max(1, Math.min(OLIST_BINDING_DB_MAX_WAIT_MS, remaining));
}

async function setBindingTimeouts(tx: { execute: (query: SQL) => Promise<unknown> }, pending?: PendingTokens): Promise<void> {
  const statementTimeoutMs = bindingTimeoutMs(pending);
  await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`));
  const lockTimeoutMs = bindingTimeoutMs(pending);
  await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`));
  ensureBindingActive(pending);
}
