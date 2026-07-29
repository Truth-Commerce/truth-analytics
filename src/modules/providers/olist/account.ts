import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { OAuthTokens } from '@/modules/providers/types';

export type OlistAccountBinding = { fingerprint: string; sourceGeneration: number };
type PendingTokens = { credentialVersion: string; tokens: OAuthTokens };

export function fingerprintOlistAccount(cpfCnpj: string): string {
  const encoded = process.env.OLIST_ACCOUNT_FINGERPRINT_KEY;
  if (!encoded) throw new Error('olist_account_fingerprint_key_invalid');
  let key: Buffer;
  try { key = Buffer.from(encoded, 'base64'); } catch { throw new Error('olist_account_fingerprint_key_invalid'); }
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('olist_account_fingerprint_key_invalid');
  return createHmac('sha256', key).update(cpfCnpj.replace(/\D/g, '')).digest('hex');
}

/** Network /info is deliberately outside the lock; publication is a single credential-CAS transaction. */
export async function loadAndBindOlistAccount(orgId: string, pending?: PendingTokens): Promise<OlistAccountBinding> {
  const { credentialVersion, getProviderOAuthCredentials, getValidAccessTokenForProvider } = await import('@/modules/connections/provider-connection.repository');
  const credentials = await getProviderOAuthCredentials(orgId, 'olist');
  if (pending && pending.credentialVersion !== credentials.version) throw new Error('olist_conta_nao_validada');
  const accessToken = pending?.tokens.accessToken ?? await getValidAccessTokenForProvider(orgId, 'olist', 0);
  const response = await fetch(new URL('/info', process.env.OLIST_API_BASE ?? 'https://api.erp.olist.com'), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('olist_conta_nao_validada');
  const body: unknown = await response.json();
  const value = typeof body === 'object' && body !== null ? (body as { cpfCnpj?: unknown; cpf_cnpj?: unknown }).cpfCnpj ?? (body as { cpf_cnpj?: unknown }).cpf_cnpj : undefined;
  if (typeof value !== 'string') throw new Error('olist_conta_nao_validada');
  const fingerprint = fingerprintOlistAccount(value);
  const { db } = await import('@/db/client');
  const { encryptConnectionSecret } = await import('@/modules/connections/connection-secrets');
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT id, oauth_client_id, oauth_client_secret FROM connections WHERE org_id=${orgId} AND provider='olist' FOR UPDATE`);
    const row = locked[0] as { id?: string; oauth_client_id?: string; oauth_client_secret?: string } | undefined;
    if (!row?.id || !row.oauth_client_id || !row.oauth_client_secret || credentialVersion(row.oauth_client_id, row.oauth_client_secret) !== credentials.version) throw new Error('olist_conta_nao_validada');
    const now = new Date();
    const tokenSet = pending ? sql`, access_token=${encryptConnectionSecret({ orgId, provider: 'olist', kind: 'access_token', value: pending.tokens.accessToken })}, refresh_token=${encryptConnectionSecret({ orgId, provider: 'olist', kind: 'refresh_token', value: pending.tokens.refreshToken })}, expira_em=${new Date(now.getTime() + pending.tokens.expiresInSeconds * 1000)}, refresh_expira_em=${new Date(now.getTime() + (pending.tokens.refreshExpiresInSeconds ?? 86_400) * 1000)}, last_refresh_at=${now}, last_error_code=NULL, last_error_at=NULL, status='configurado'` : sql``;
    const applied = await tx.execute(sql`UPDATE connections SET provider_account_fingerprint=${fingerprint}, data_generation=data_generation+1, updated_at=clock_timestamp() ${tokenSet} WHERE id=${row.id} AND oauth_client_id=${row.oauth_client_id} AND oauth_client_secret=${row.oauth_client_secret} RETURNING data_generation`);
    const generation = (applied[0] as { data_generation?: number } | undefined)?.data_generation;
    if (!generation) throw new Error('olist_conta_nao_validada');
    // A new generation cannot reuse readiness from the prior generation.
    await tx.execute(sql`DELETE FROM connection_sync_state WHERE org_id=${orgId} AND provider='olist'`);
    return { fingerprint, sourceGeneration: generation };
  });
}
