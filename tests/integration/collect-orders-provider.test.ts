import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connectionSyncState, connections, orders, organizations } from '@/db/schema';
import { acquireSyncLease, getSyncLeaseRemainingMs } from '@/modules/connections/sync-state.repository';
import type { ErpDataProvider, OrderPage } from '@/modules/providers/data.types';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();
const periodo = { inicio: new Date('2024-01-01T00:00:00.000Z'), fim: new Date('2024-01-31T00:00:00.000Z') };

describe.skipIf(!url)('collect-orders provider-aware — integração', () => {
  let orgA = '';
  let orgB = '';
  const sourceA = () => ({ orgId: orgA, provider: 'olist' as const, sourceGeneration: 3 });
  const sourceB = () => ({ orgId: orgB, provider: 'olist' as const, sourceGeneration: 1 });

  beforeAll(async () => {
    [orgA] = (await tdb.insert(organizations).values({ name: `collect-provider-a-${RUN}`, status: 'active' }).returning({ id: organizations.id })).map((row) => row.id);
    [orgB] = (await tdb.insert(organizations).values({ name: `collect-provider-b-${RUN}`, status: 'active' }).returning({ id: organizations.id })).map((row) => row.id);
    await tdb.insert(connections).values([
      { org_id: orgA, provider: 'olist', provider_account_fingerprint: 'a'.repeat(64), data_generation: 3, status: 'configurado' },
      { org_id: orgB, provider: 'olist', provider_account_fingerprint: 'b'.repeat(64), data_generation: 1, status: 'configurado' },
    ]);
  });
  afterAll(async () => {
    await tdb.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgA));
    await tdb.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgB));
    await tdb.delete(orders).where(eq(orders.org_id, orgA));
    await tdb.delete(orders).where(eq(orders.org_id, orgB));
    await tdb.delete(connections).where(eq(connections.org_id, orgA));
    await tdb.delete(connections).where(eq(connections.org_id, orgB));
    await tdb.delete(organizations).where(eq(organizations.id, orgA));
    await tdb.delete(organizations).where(eq(organizations.id, orgB));
    await sql.end();
  });

  it('is idempotent per organization and source generation while retaining list-owned fields only', async () => {
    const registry = await import('@/modules/providers/registry');
    const page: OrderPage = { orders: [{ providerOrderId: '6201', providerStatus: 'open', canal: 'Loja', data: new Date('2024-01-10T00:00:00.000Z'), valorTotal: 25, frete: 0, itens: [] }], offset: 0, nextOffset: 1, total: 1, done: true };
    const provider: ErpDataProvider = { name: 'olist', fetchOrders: async (_org, _request, onPage) => onPage(page), fetchOrderDetail: vi.fn() };
    vi.spyOn(registry, 'getErpDataProvider').mockReturnValue(provider);
    const { collectOrders } = await import('@/modules/pipeline/steps/collect-orders');
    await collectOrders(sourceA(), periodo);
    await collectOrders(sourceA(), periodo);
    await collectOrders(sourceB(), periodo);
    await tdb.update(orders).set({ itens: [{ nome: 'detalhe', quantidade: 1, valor: 25 }], frete: '9.00' }).where(and(eq(orders.org_id, orgA), eq(orders.provider_order_id, '6201')));
    await collectOrders(sourceA(), periodo);
    const rowsA = await tdb.select().from(orders).where(and(eq(orders.org_id, orgA), eq(orders.provider_order_id, '6201')));
    const rowsB = await tdb.select().from(orders).where(and(eq(orders.org_id, orgB), eq(orders.provider_order_id, '6201')));
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({ provider: 'olist', source_generation: 3, provider_status: 'open', frete: '9.00' });
    expect(rowsA[0].itens).toEqual([{ nome: 'detalhe', quantidade: 1, valor: 25 }]);
  });

  it('does not advance the cursor when a later page loses its lease before persistence', async () => {
    const { persistOrdersPageWithLease } = await import('@/modules/pipeline/steps/collect-orders');
    const source = sourceA();
    const lease = await acquireSyncLease({ source: { ...source, accountFingerprint: 'a'.repeat(64) }, resource: 'orders_list', ttlMs: 270_000 });
    expect(lease).not.toBeNull();
    const first: OrderPage = { orders: [{ providerOrderId: `page-1-${RUN}`, providerStatus: 'open', canal: 'Loja', data: new Date(), valorTotal: 1, frete: 0, itens: [] }], offset: 0, nextOffset: 1, total: 2, done: false };
    const cursor1 = { pass: 'created' as const, from: periodo.inicio.toISOString(), to: periodo.fim.toISOString(), updatedAfter: periodo.inicio.toISOString(), offset: 1, total: 2, sourceGeneration: 3 };
    expect(await persistOrdersPageWithLease({ lease: lease!, source, page: first, nextCursor: cursor1 })).toBe(true);
    await sql`UPDATE connection_sync_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE lease_token=${lease!.token}`;
    const second: OrderPage = { ...first, orders: [{ ...first.orders[0], providerOrderId: `page-2-${RUN}` }], offset: 1, nextOffset: 2, done: true };
    expect(await persistOrdersPageWithLease({ lease: lease!, source, page: second, nextCursor: { ...cursor1, offset: 2 } })).toBe(false);
    const [state] = await sql`SELECT cursor FROM connection_sync_state WHERE org_id=${orgA} AND provider='olist' AND source_generation=3 AND resource='orders_list'`;
    expect(state.cursor).toEqual(cursor1);
    const missing = await tdb.select().from(orders).where(and(eq(orders.org_id, orgA), eq(orders.provider_order_id, `page-2-${RUN}`)));
    expect(missing).toHaveLength(0);
  });

  it('renews from the PostgreSQL remaining-time authority before the Olist request', async () => {
    const registry = await import('@/modules/providers/registry');
    const provider: ErpDataProvider = { name: 'olist', fetchOrders: async (_org, _request, onPage) => onPage({ orders: [], offset: 0, nextOffset: 0, total: 0, done: true }), fetchOrderDetail: vi.fn() };
    vi.spyOn(registry, 'getErpDataProvider').mockReturnValue(provider);
    const existing = await acquireSyncLease({ source: { ...sourceB(), accountFingerprint: 'b'.repeat(64) }, resource: 'orders_list', ttlMs: 270_000 });
    await sql`UPDATE connection_sync_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE lease_token=${existing!.token}`;
    const { collectOrders } = await import('@/modules/pipeline/steps/collect-orders');
    await collectOrders(sourceB(), periodo);
    expect(await getSyncLeaseRemainingMs(existing!)).toBeNull();
  });

  it('resumes a compatible saved cursor and lets an explicit startOffset take precedence', async () => {
    const registry = await import('@/modules/providers/registry');
    const offsets: number[] = [];
    const provider: ErpDataProvider = { name: 'olist', fetchOrders: async (_org, request, onPage) => { offsets.push(request.offset); await onPage({ orders: [], offset: request.offset, nextOffset: request.offset, total: request.offset, done: true }); }, fetchOrderDetail: vi.fn() };
    vi.spyOn(registry, 'getErpDataProvider').mockReturnValue(provider);
    await sql`UPDATE connection_sync_state SET cursor=${JSON.stringify({ pass: 'created', from: periodo.inicio.toISOString(), to: periodo.fim.toISOString(), updatedAfter: periodo.inicio.toISOString(), offset: 7, total: 9, sourceGeneration: 1 })}::jsonb, lease_token=NULL, lease_expires_at=NULL WHERE org_id=${orgB} AND provider='olist' AND source_generation=1 AND resource='orders_list'`;
    const { collectOrders } = await import('@/modules/pipeline/steps/collect-orders');
    await collectOrders(sourceB(), periodo);
    await collectOrders(sourceB(), periodo, { startOffset: 2 });
    expect(offsets).toEqual([7, 2]);
  });

  it('rejects an expired predecessor and every ownership mismatch without writing order or cursor', async () => {
    const { persistOrdersPageWithLease } = await import('@/modules/pipeline/steps/collect-orders');
    const source = sourceB();
    const predecessor = await acquireSyncLease({ source: { ...source, accountFingerprint: 'b'.repeat(64) }, resource: 'orders_list', ttlMs: 270_000 });
    await sql`UPDATE connection_sync_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE lease_token=${predecessor!.token}`;
    const successor = await acquireSyncLease({ source: { ...source, accountFingerprint: 'b'.repeat(64) }, resource: 'orders_list', ttlMs: 270_000 });
    expect(successor!.fencingVersion).toBeGreaterThan(predecessor!.fencingVersion);
    const page: OrderPage = { orders: [{ providerOrderId: `fenced-${RUN}`, providerStatus: 'open', canal: 'Loja', data: new Date(), valorTotal: 1, frete: 0, itens: [] }], offset: 0, nextOffset: 1, total: 1, done: true };
    const cursor = { pass: 'created' as const, from: periodo.inicio.toISOString(), to: periodo.fim.toISOString(), updatedAfter: periodo.inicio.toISOString(), offset: 1, total: 1, sourceGeneration: 1 };
    const variants = [
      predecessor!,
      { ...successor!, sourceGeneration: 2 },
      { ...successor!, accountFingerprint: 'c'.repeat(64) },
      { ...successor!, token: 'invalid-token' },
      { ...successor!, fencingVersion: successor!.fencingVersion + 1n },
      { ...successor!, expiresAt: new Date(0) },
    ];
    for (const lease of variants) expect(await persistOrdersPageWithLease({ lease, source, page, nextCursor: cursor })).toBe(false);
    const rows = await tdb.select().from(orders).where(and(eq(orders.org_id, orgB), eq(orders.provider_order_id, `fenced-${RUN}`)));
    expect(rows).toHaveLength(0);
    const [state] = await sql`SELECT cursor FROM connection_sync_state WHERE lease_token=${successor!.token}`;
    expect(state.cursor).toBeNull();
  });
});
