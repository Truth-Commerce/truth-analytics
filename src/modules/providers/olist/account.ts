import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';

export type OlistAccountBinding = { fingerprint: string; sourceGeneration: number };

/** Contract stub intentionally replaced after the RED suite is observed. */
export function fingerprintOlistAccount(cpfCnpj: string): string {
  const key = process.env.OLIST_ACCOUNT_FINGERPRINT_KEY;
  // Base64 is intentional: operational keys are 32-byte secrets, never a fallback encryption key.
  if (!key || Buffer.from(key, 'base64').length !== 32) {
    throw new Error('olist_account_fingerprint_key_invalid');
  }
  return createHmac('sha256', Buffer.from(key, 'base64'))
    .update(cpfCnpj.replace(/\D/g, ''))
    .digest('hex');
}

export async function loadAndBindOlistAccount(orgId: string): Promise<OlistAccountBinding> {
  // Keep fingerprint validation independently importable; DB configuration is only required for binding.
  const [{ db }, { credentialVersion, getProviderOAuthCredentials, getValidAccessTokenForProvider }] = await Promise.all([
    import('@/db/client'),
    import('@/modules/connections/provider-connection.repository'),
  ]);
  const before = await getProviderOAuthCredentials(orgId, 'olist');
  const token = await getValidAccessTokenForProvider(orgId, 'olist');
  const response = await fetch(new URL('/info', process.env.OLIST_API_BASE ?? 'https://api.erp.olist.com'), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('olist_conta_nao_validada');
  const body: unknown = await response.json();
  const document = typeof body === 'object' && body !== null
    ? (body as { cpfCnpj?: unknown; cpf_cnpj?: unknown }).cpfCnpj ?? (body as { cpf_cnpj?: unknown }).cpf_cnpj
    : undefined;
  if (typeof document !== 'string') throw new Error('olist_conta_nao_validada');
  const fingerprint = fingerprintOlistAccount(document);
  // Network happens before this short transaction; the credential version is rechecked before write.
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT oauth_client_id, oauth_client_secret FROM connections WHERE org_id = ${orgId} AND provider = 'olist' FOR UPDATE`);
    const row = locked[0] as { oauth_client_id?: string; oauth_client_secret?: string } | undefined;
    if (!row?.oauth_client_id || !row.oauth_client_secret || credentialVersion(row.oauth_client_id, row.oauth_client_secret) !== before.version) throw new Error('olist_conta_nao_validada');
    const rows = await tx.execute(sql`
      UPDATE connections SET provider_account_fingerprint = ${fingerprint}, data_generation = data_generation + 1, updated_at = clock_timestamp()
      WHERE org_id = ${orgId} AND provider = 'olist' AND oauth_client_id=${row.oauth_client_id} AND oauth_client_secret=${row.oauth_client_secret}
      RETURNING data_generation
    `);
    const generation = (rows[0] as { data_generation?: number } | undefined)?.data_generation;
    if (!generation) throw new Error('olist_conta_nao_validada');
    // Readiness is generation-bound; old data remains stored but cannot certify the new binding.
    await tx.execute(sql`DELETE FROM connection_sync_state WHERE org_id=${orgId} AND provider='olist'`);
    return { fingerprint, sourceGeneration: generation };
  });
}
