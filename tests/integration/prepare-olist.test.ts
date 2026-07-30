import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectionSyncState, orders, organizations } from '@/db/schema';
import { acquireSyncLease } from '@/modules/connections/sync-state.repository';
import { __test } from '@/modules/pipeline/prepare-olist';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
describe.skipIf(!url)('Olist prepare persistPage — PostgreSQL fence', () => {
  const sql = postgres(url ?? '', { prepare: false }); const db = drizzle(sql); let orgId = '';
  const source = () => ({ orgId, provider: 'olist' as const, sourceGeneration: 1 });
  const cursor = () => ({ version: 1 as const, stage: 'snapshot' as const, sourceGeneration: 1, accountFingerprint: 'a'.repeat(64), window: { from: '2026-05-01T00:00:00.000Z', to: '2026-07-30T00:00:00.000Z' }, catchUpFrom: '2026-07-30T19:00:00.000Z', snapshot: { done: false }, catchup: { done: false, completedAt: null }, verify1: null, verify2: null, progress: { phaseKey: 'snapshot' as const, cycleId: 'run', offset: 1, total: 1 } });
  const page = [{ providerOrderId: `pg-${RUN}`, providerStatus: 'ok', canal: 'site', data: new Date('2026-06-01T00:00:00Z'), valorTotal: 12, frete: 0, itens: [] }];
  beforeAll(async () => { const [org] = await db.insert(organizations).values({ name: `ta-prepare-${RUN}`, status: 'active' }).returning({ id: organizations.id }); orgId = org.id; });
  afterEach(async () => { await db.delete(orders).where(eq(orders.org_id, orgId)); await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId)); });
  afterAll(async () => { await db.delete(organizations).where(eq(organizations.id, orgId)); await sql.end(); });

  it('writes order and cursor only for the exact active token and fencing owner', async () => {
    const lease = await acquireSyncLease({ source: { ...source(), accountFingerprint: 'a'.repeat(64) }, resource: 'orders_prepare', ttlMs: 60_000 });
    expect(await __test.persistPage(lease!, source(), page, cursor())).toBe(true);
    expect((await db.select().from(orders).where(eq(orders.org_id, orgId))).length).toBe(1);
    const [state] = await db.select().from(connectionSyncState).where(eq(connectionSyncState.org_id, orgId)); expect(state.cursor).toMatchObject({ progress: { offset: 1 } });
    await db.delete(orders).where(eq(orders.org_id, orgId));
    expect(await __test.persistPage({ ...lease!, token: 'wrong' }, source(), page, cursor())).toBe(false);
    expect((await db.select().from(orders).where(eq(orders.org_id, orgId))).toHaveLength(0);
    expect(await __test.persistPage({ ...lease!, fencingVersion: lease!.fencingVersion + 1n }, source(), page, cursor())).toBe(false);
    await sql`UPDATE connection_sync_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=${state.id}`;
    expect(await __test.persistPage(lease!, source(), page, cursor())).toBe(false);
    expect((await db.select().from(orders).where(eq(orders.org_id, orgId))).toHaveLength(0);
  });
});
