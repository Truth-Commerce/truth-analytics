import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connectionSyncState, connections, orders, organizations } from '@/db/schema';
import type { ErpDataProvider } from '@/modules/providers/data.types';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const db = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('sync incremental Olist', () => {
  let orgId = '';
  const source = () => ({ orgId, provider: 'olist' as const, sourceGeneration: 3 });

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({ name: `ta-sync-olist-${RUN}`, status: 'active' }).returning({ id: organizations.id });
    orgId = org.id;
    await db.insert(connections).values({
      org_id: orgId, provider: 'olist', data_generation: 3, access_token: 'token', status: 'ok',
      provider_account_fingerprint: 'a'.repeat(64), last_sync_at: new Date('2026-07-01T10:00:00Z'),
    });
  });

  beforeEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    vi.restoreAllMocks();
    await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
    await db.delete(orders).where(eq(orders.org_id, orgId));
    await db.delete(connections).where(eq(connections.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('rejects a missing incremental baseline before starting provider I/O', async () => {
    await db.update(connections).set({ last_sync_at: null }).where(eq(connections.org_id, orgId));
    const registry = await import('@/modules/providers/registry');
    const fetchOrders = vi.fn();
    vi.spyOn(registry, 'getErpDataProvider').mockReturnValue({ name: 'olist', fetchOrders, fetchOrderDetail: vi.fn() } as ErpDataProvider);
    const { sincronizarPedidosDaOrg } = await import('@/modules/pipeline/sync-pedidos');
    await expect(sincronizarPedidosDaOrg(source(), new Date('2026-07-01T11:00:00Z')))
      .rejects.toThrow('olist_incremental_baseline_missing');
    expect(fetchOrders).not.toHaveBeenCalled();
  });

  it('uses a five-minute overlap and publishes freshness only after a complete exact-source sync', async () => {
    const watermark = new Date('2026-07-01T10:00:00Z');
    const now = new Date('2026-07-01T11:00:00Z');
    await db.update(connections).set({ last_sync_at: watermark }).where(eq(connections.org_id, orgId));
    const registry = await import('@/modules/providers/registry');
    const requests: Array<{ updatedAfter: Date }> = [];
    vi.spyOn(registry, 'getErpDataProvider').mockReturnValue({
      name: 'olist', fetchOrderDetail: vi.fn(),
      fetchOrders: async (_org, request, onPage) => {
        if (request.mode !== 'updated') throw new Error('expected_incremental_request');
        requests.push({ updatedAfter: request.updatedAfter });
        await onPage({ orders: [], offset: request.offset, nextOffset: request.offset, total: 0, done: true });
      },
    } as ErpDataProvider);
    const { sincronizarPedidosDaOrg } = await import('@/modules/pipeline/sync-pedidos');
    await expect(sincronizarPedidosDaOrg(source(), now)).resolves.toMatchObject({
      enriquecimento: { incompleto: false },
    });
    expect(requests).toEqual([{ updatedAfter: new Date(watermark.getTime() - 5 * 60_000) }]);
    const [fresh] = await db.select({ last: connections.last_sync_at }).from(connections)
      .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist'), eq(connections.data_generation, 3)));
    expect(fresh.last).toEqual(now);
  });

  it('leaves freshness untouched when an incomplete collection returns', async () => {
    const watermark = new Date('2026-07-01T10:00:00Z');
    await db.update(connections).set({ last_sync_at: watermark }).where(eq(connections.org_id, orgId));
    const collector = await import('@/modules/pipeline/steps/collect-orders');
    vi.spyOn(collector, 'collectOrders').mockResolvedValue({ processados: 0, total: 0, incompleto: true });
    const { sincronizarPedidosDaOrg } = await import('@/modules/pipeline/sync-pedidos');
    await expect(sincronizarPedidosDaOrg(source(), new Date('2026-07-01T11:00:00Z'))).resolves.toMatchObject({ incompleto: true });
    const [fresh] = await db.select({ last: connections.last_sync_at }).from(connections).where(eq(connections.org_id, orgId));
    expect(fresh.last).toEqual(watermark);
  });
});
