import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';

import { auditLog, connections, organizations, users } from '@/db/schema';

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
    expect(row.status).toBe('ok');
    expect(row.generation).toBe(publication.dataGeneration + 1);
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    fetchSpy.mockRestore();
  });
});
