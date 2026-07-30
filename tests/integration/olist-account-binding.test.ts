import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql as drizzleSql } from 'drizzle-orm';

import { auditLog, connectionSyncState, connections, organizations, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const run = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

describe.skipIf(!url)('Olist account binding — PostgreSQL real', () => {
  // Keep each test-side client constrained: this catches code that accidentally
  // relies on multiple connections while callbacks contend for the same row.
  const sql = postgres(url ?? '', { prepare: false, max: 1 });
  const tdb = drizzle(sql);
  let orgId = '';
  let userId = '';

  beforeAll(async () => {
    process.env.OLIST_ACCOUNT_FINGERPRINT_KEY = Buffer.alloc(32, 19).toString('base64');
    const [org] = await tdb.insert(organizations).values({ name: `olist-binding-${run}`, status: 'active' }).returning({ id: organizations.id });
    orgId = org.id;
    const [user] = await tdb.insert(users).values({ org_id: orgId, email: `olist-binding-${run}@example.com`, senha_hash: 'test', role: 'client' }).returning({ id: users.id });
    userId = user.id;
    const { configureProviderCredentials } = await import('@/modules/connections/provider-connection.repository');
    await configureProviderCredentials({ orgId, provider: 'olist', clientId: 'client', clientSecret: 'secret', actorUserId: userId });
  });

  afterAll(async () => {
    if (orgId) {
      await tdb.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
      await tdb.delete(connections).where(eq(connections.org_id, orgId));
      await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
      if (userId) await tdb.delete(users).where(eq(users.id, userId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
    await sql.end();
  });

  it('permite que somente um callback concorrente publique tokens e fingerprint', async () => {
    const { getOlistPublicationContext } = await import('@/modules/connections/provider-connection.repository');
    const { loadAndBindOlistAccount } = await import('@/modules/providers/olist/account');
    const publication = await getOlistPublicationContext(orgId);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ cpfCnpj: '12345678000199' }), { status: 200 }));
    const first = { credentialVersion: publication.credentialVersion, sourceGeneration: publication.dataGeneration, tokens: { accessToken: 'access-a', refreshToken: 'refresh-a', expiresInSeconds: 3600 } };
    const second = { ...first, tokens: { accessToken: 'access-b', refreshToken: 'refresh-b', expiresInSeconds: 3600 } };

    const result = await Promise.allSettled([loadAndBindOlistAccount(orgId, first), loadAndBindOlistAccount(orgId, second)]);
    expect(result.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    const [row] = await tdb.select({ status: connections.status, generation: connections.data_generation, fingerprint: connections.provider_account_fingerprint }).from(connections).where(eq(connections.org_id, orgId));
    expect(row.status).toBe('configurado');
    expect(row.generation).toBe(publication.dataGeneration + 1);
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    fetchSpy.mockRestore();
  });

  it('faz rollback da publicação se o lifecycle abortar enquanto a mutação final espera lock', async () => {
    const { configureProviderCredentials, getOlistPublicationContext } = await import('@/modules/connections/provider-connection.repository');
    const { loadAndBindOlistAccount } = await import('@/modules/providers/olist/account');
    await configureProviderCredentials({ orgId, provider: 'olist', clientId: 'client-rollback', clientSecret: 'secret-rollback', actorUserId: userId });
    const publication = await getOlistPublicationContext(orgId);
    await tdb.insert(connectionSyncState).values({ org_id: orgId, provider: 'olist', resource: 'rollback-barrier' });

    const blocker = postgres(url ?? '', { prepare: false, max: 1 });
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const lockAcquired = new Promise<void>((resolve) => { locked = resolve; });
    const heldLock = blocker.begin(async (tx) => {
      await tx`SELECT id FROM connection_sync_state WHERE org_id=${orgId} AND provider='olist' AND resource='rollback-barrier' FOR UPDATE`;
      locked();
      await released;
    });
    await lockAcquired;

    const controller = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ cpfCnpj: '12345678000199' }), { status: 200 }));
    const binding = loadAndBindOlistAccount(orgId, {
      credentialVersion: publication.credentialVersion,
      sourceGeneration: publication.dataGeneration,
      tokens: { accessToken: 'rollback-access', refreshToken: 'rollback-refresh', expiresInSeconds: 3600 },
      signal: controller.signal,
    });
    await waitForBlockedDelete(tdb);
    controller.abort();
    release();

    await expect(binding).rejects.toThrow('olist_deadline_exceeded');
    await heldLock;
    const [row] = await tdb.select({ generation: connections.data_generation, fingerprint: connections.provider_account_fingerprint, accessToken: connections.access_token }).from(connections).where(eq(connections.org_id, orgId));
    expect(row).toMatchObject({ generation: publication.dataGeneration, fingerprint: null, accessToken: null });
    fetchSpy.mockRestore();
    await blocker.end();
  });

  it('não publica /info obtido com credencial que mudou durante a requisição', async () => {
    const { configureProviderCredentials, getOlistPublicationContext } = await import('@/modules/connections/provider-connection.repository');
    const { loadAndBindOlistAccount } = await import('@/modules/providers/olist/account');
    await configureProviderCredentials({ orgId, provider: 'olist', clientId: 'client-before-info', clientSecret: 'secret-before-info', actorUserId: userId });
    const publication = await getOlistPublicationContext(orgId);
    let releaseResponse!: () => void;
    const responseReleased = new Promise<void>((resolve) => { releaseResponse = resolve; });
    let requestStarted!: () => void;
    const requestSeen = new Promise<void>((resolve) => { requestStarted = resolve; });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      requestStarted();
      await responseReleased;
      return new Response(JSON.stringify({ cpfCnpj: '12345678000199' }), { status: 200 });
    });
    const binding = loadAndBindOlistAccount(orgId, {
      credentialVersion: publication.credentialVersion,
      sourceGeneration: publication.dataGeneration,
      tokens: { accessToken: 'stale-access', refreshToken: 'stale-refresh', expiresInSeconds: 3600 },
    });
    await requestSeen;
    await configureProviderCredentials({ orgId, provider: 'olist', clientId: 'client-after-info', clientSecret: 'secret-after-info', actorUserId: userId });
    releaseResponse();

    await expect(binding).rejects.toThrow('olist_conta_nao_validada');
    const [row] = await tdb.select({ fingerprint: connections.provider_account_fingerprint, accessToken: connections.access_token }).from(connections).where(eq(connections.org_id, orgId));
    expect(row).toMatchObject({ fingerprint: null, accessToken: null });
    fetchSpy.mockRestore();
  });
});

async function waitForBlockedDelete(tdb: ReturnType<typeof drizzle>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await tdb.execute(
      // The lock wait is the barrier: this only becomes true once the production
      // transaction has already applied UPDATE and is blocked on its final DELETE.
      drizzleSql`SELECT 1 FROM pg_stat_activity WHERE query LIKE '%DELETE FROM connection_sync_state%' AND wait_event_type = 'Lock'`,
    );
    if (rows.length > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('binding did not reach final DELETE barrier');
}
