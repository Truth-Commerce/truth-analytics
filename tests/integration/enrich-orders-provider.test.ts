import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { connectionSyncState, connections, orders, organizations } from '@/db/schema';
import { acquireSyncLease } from '@/modules/connections/sync-state.repository';
import type { ErpDataProvider } from '@/modules/providers/data.types';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('enrich-orders provider-aware — integração PostgreSQL', () => {
  let orgId = '';
  const source = () => ({ orgId, provider: 'olist' as const, sourceGeneration: 3 });
  const insert = (providerOrderId: string, generation = 3, attempts = 0) => tdb.insert(orders).values({ org_id: orgId, provider: 'olist', source_generation: generation, provider_order_id: providerOrderId, canal: 'Loja', data: new Date(), valor_total: '10', enrichment_attempts: attempts });

  beforeAll(async () => {
    [orgId] = (await tdb.insert(organizations).values({ name: `enrich-provider-${RUN}`, status: 'active' }).returning({ id: organizations.id })).map(row => row.id);
    await tdb.insert(connections).values({ org_id: orgId, provider: 'olist', provider_account_fingerprint: 'a'.repeat(64), data_generation: 3, status: 'configurado' });
  });
  afterEach(async () => {
    await tdb.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
    await tdb.delete(orders).where(eq(orders.org_id, orgId));
    vi.restoreAllMocks();
  });
  afterAll(async () => { await tdb.delete(connections).where(eq(connections.org_id, orgId)); await tdb.delete(organizations).where(eq(organizations.id, orgId)); await sql.end(); });

  it('enriches only the selected organization/provider/generation and serializes Olist detail calls', async () => {
    await insert('selected'); await insert('other-generation', 2); await insert('quarantined', 3, 5);
    const registry = await import('@/modules/providers/registry'); let active = 0; let maxActive = 0;
    const provider: ErpDataProvider = { name: 'olist', fetchOrders: vi.fn(), fetchOrderDetail: async (_org, id) => { active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return { itens: [{ nome: id, quantidade: 1, valor: 10 }], frete: 1, comissao: 2 }; } };
    vi.spyOn(registry, 'getErpDataProvider').mockReturnValue(provider);
    const { enrichOrders } = await import('@/modules/pipeline/steps/enrich-orders');
    const result = await enrichOrders(source(), { maxPedidos: 10, prazoMs: 60_000 });
    expect(result).toMatchObject({ enriquecidos: 1, falhas: 0, restantes: 0, incompleto: false });
    expect(maxActive).toBe(1);
    const selected = await tdb.select().from(orders).where(and(eq(orders.org_id, orgId), eq(orders.provider_order_id, 'selected')));
    const untouched = await tdb.select().from(orders).where(and(eq(orders.org_id, orgId), eq(orders.provider_order_id, 'other-generation')));
    expect(selected[0].enriquecido_em).toBeTruthy(); expect(untouched[0].enriquecido_em).toBeNull();
  });

  it('fences stale generation, fingerprint, token, fence and expiry without changing detail or attempts', async () => {
    await insert('fenced');
    const { persistOrderDetailWithLease } = await import('@/modules/pipeline/steps/enrich-orders');
    const lease = await acquireSyncLease({ source: { ...source(), accountFingerprint: 'a'.repeat(64) }, resource: 'order_details', ttlMs: 270_000 });
    const variants = [{ ...lease!, sourceGeneration: 4 }, { ...lease!, accountFingerprint: 'b'.repeat(64) }, { ...lease!, token: 'bad' }, { ...lease!, fencingVersion: lease!.fencingVersion + 1n }, { ...lease!, expiresAt: new Date(0) }];
    for (const stale of variants) expect(await persistOrderDetailWithLease({ lease: stale, source: source(), order: { id: (await tdb.select({ id: orders.id }).from(orders).where(eq(orders.provider_order_id, 'fenced')))[0].id, providerOrderId: 'fenced', enrichmentAttempts: 0 }, detail: { itens: [], frete: 0, comissao: 0 } })).toBe(false);
    const [row] = await tdb.select().from(orders).where(eq(orders.provider_order_id, 'fenced'));
    expect(row).toMatchObject({ enriquecido_em: null, enrichment_attempts: 0 });
  });

  it('quarantines the fifth permanent failure but keeps transient failures retryable', async () => {
    await insert('permanent', 3, 4); await insert('transient');
    const registry = await import('@/modules/providers/registry');
    vi.spyOn(registry, 'getErpDataProvider').mockReturnValue({ name: 'olist', fetchOrders: vi.fn(), fetchOrderDetail: async (_org, id) => { const error = Object.assign(new Error(id), { status: id === 'permanent' ? 404 : 500 }); throw error; } });
    const { enrichOrders } = await import('@/modules/pipeline/steps/enrich-orders');
    const result = await enrichOrders(source(), { maxPedidos: 10, prazoMs: 60_000 });
    expect(result).toMatchObject({ falhas: 2, quarentenados: 1, restantes: 1, incompleto: true });
    const rows = await tdb.select().from(orders).where(eq(orders.org_id, orgId));
    expect(rows.find(row => row.provider_order_id === 'permanent')).toMatchObject({ enrichment_attempts: 5, enrichment_last_error_code: 'missing_remote' });
    expect(rows.find(row => row.provider_order_id === 'transient')).toMatchObject({ enrichment_attempts: 0, enrichment_last_error_code: 'remote_transient' });
  });
});
