import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectionSyncState, connections, orders, organizations } from '@/db/schema';
import { reconcileOrderReadiness } from '@/modules/pipeline/order-reconciliation';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('order readiness — integração PostgreSQL', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);
  const fingerprint = 'a'.repeat(64);
  let orgId = '';
  const source = (overrides = {}) => ({ orgId, provider: 'olist' as const, sourceGeneration: 3, accountFingerprint: fingerprint, ...overrides });
  const cursor = (overrides = {}) => ({
    version: 1, sourceGeneration: 3, accountFingerprint: fingerprint,
    window: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z' },
    catchUpFrom: '2026-07-01T00:00:00.000Z', snapshot: { done: true }, catchup: { done: true },
    expectedCount: 1, checksum: createHash('md5').update('ready-order||10.00').digest('hex'),
    verification: { dailyTotals: { expectedChecksum: 'b'.repeat(32), actualChecksum: 'b'.repeat(32) }, channelSamples: { expectedChecksum: 'c'.repeat(32), actualChecksum: 'c'.repeat(32) } }, ...overrides,
  });

  beforeAll(async () => {
    [orgId] = (await tdb.insert(organizations).values({ name: `order-readiness-${RUN}`, status: 'active' }).returning({ id: organizations.id })).map(row => row.id);
    await tdb.insert(connections).values({ org_id: orgId, provider: 'olist', data_generation: 3, provider_account_fingerprint: fingerprint, access_token: 'shadow-token', refresh_token: 'shadow-refresh', status: 'configurado' });
  });
  afterEach(async () => {
    await tdb.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
    await tdb.delete(orders).where(eq(orders.org_id, orgId));
    await tdb.update(connections).set({ refresh_token: 'shadow-refresh' }).where(eq(connections.org_id, orgId));
  });
  afterAll(async () => { await tdb.delete(connections).where(eq(connections.org_id, orgId)); await tdb.delete(organizations).where(eq(organizations.id, orgId)); await sql.end(); });

  async function seed(state = cursor(), order = { attempts: 0, pending: false }) {
    await tdb.insert(connectionSyncState).values({ org_id: orgId, provider: 'olist', source_generation: 3, account_fingerprint: fingerprint, resource: 'orders_prepare', cursor: state });
    await tdb.insert(orders).values({ org_id: orgId, provider: 'olist', source_generation: 3, provider_order_id: 'ready-order', canal: 'Olist', data: new Date('2026-07-01T12:00:00.000Z'), valor_total: '10.00', enrichment_attempts: order.attempts });
    if (!order.pending) await tdb.update(orders).set({ enriquecido_em: new Date() }).where(eq(orders.org_id, orgId));
  }

  it('aceita conexão configurada somente quando fonte e preparação exatas coincidem', async () => {
    await seed();
    await expect(reconcileOrderReadiness(source())).resolves.toMatchObject({ ready: true, reasons: [] });
    await tdb.insert(orders).values({ org_id: orgId, provider: 'olist', source_generation: 3, provider_order_id: 'outside-window', canal: 'Olist', data: new Date('2026-07-03T12:00:00.000Z'), valor_total: '99.00' });
    await expect(reconcileOrderReadiness(source())).resolves.toMatchObject({ ready: true, reasons: [] });
    await expect(reconcileOrderReadiness(source({ accountFingerprint: 'b'.repeat(64) }))).resolves.toMatchObject({ ready: false, reasons: ['source_stale', 'preparation_incomplete'] });
    await expect(reconcileOrderReadiness(source({ sourceGeneration: 4 }))).resolves.toMatchObject({ ready: false, reasons: ['source_stale', 'preparation_incomplete'] });
    await tdb.update(connections).set({ refresh_token: null }).where(eq(connections.org_id, orgId));
    await expect(reconcileOrderReadiness(source())).resolves.toMatchObject({ ready: false, reasons: ['source_stale'] });
  });

  it('bloqueia pendência, quarentena e divergências de reconciliação', async () => {
    await seed(cursor({ expectedCount: 2, checksum: 'a'.repeat(32) }), { attempts: 5, pending: true });
    await expect(reconcileOrderReadiness(source())).resolves.toMatchObject({
      ready: false,
      reasons: ['count_mismatch', 'checksum_mismatch', 'details_quarantined'],
    });
    await sql`UPDATE orders SET enrichment_attempts=0, enriquecido_em=NULL WHERE org_id=${orgId}`;
    await expect(reconcileOrderReadiness(source())).resolves.toMatchObject({
      ready: false,
      reasons: ['count_mismatch', 'checksum_mismatch', 'details_pending'],
    });
  });
});
