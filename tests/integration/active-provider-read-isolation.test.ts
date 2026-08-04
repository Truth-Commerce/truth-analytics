import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connections, orders, organizations, productStock, reports, trackedProducts } from '@/db/schema';
import { serverEnv } from '@/lib/env';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('active provider order read isolation', () => {
  let orgId = '';
  let reportId = '';
  let blockedOlistOrgIds: string[] = [];
  let blingAfterBlockedOrgId = '';
  const agora = new Date('2026-07-30T12:00:00Z');

  beforeAll(async () => {
    const [org] = await tdb.insert(organizations).values({ name: `active-source-${RUN}`, status: 'active' }).returning({ id: organizations.id });
    orgId = org.id;
    await tdb.insert(connections).values([
      { org_id: orgId, provider: 'bling', data_generation: 1, access_token: 'test', status: 'ok' },
      { org_id: orgId, provider: 'olist', data_generation: 3, access_token: 'test', status: 'configurado' },
    ]);
    await tdb.insert(orders).values([
      { org_id: orgId, provider: 'bling', source_generation: 1, provider_order_id: `b-${RUN}`, bling_order_id: `b-${RUN}`, provider_status: '1', canal: 'bling', data: agora, valor_total: '100', itens: [{ sku: `sku-bling-${RUN}`, nome: 'Bling', quantidade: 1, valor: 100 }] },
      { org_id: orgId, provider: 'olist', source_generation: 3, provider_order_id: `o-${RUN}`, provider_status: '1', canal: 'olist', data: agora, valor_total: '900', itens: [{ sku: `sku-olist-${RUN}`, nome: 'Olist', quantidade: 9, valor: 100 }] },
      { org_id: orgId, provider: 'olist', source_generation: 2, provider_order_id: `old-${RUN}`, provider_status: '1', canal: 'olist', data: agora, valor_total: '8000', itens: [{ sku: `sku-old-${RUN}`, nome: 'Antigo', quantidade: 80, valor: 100 }] },
      { org_id: orgId, provider: 'olist', source_generation: 3, provider_order_id: `cancel-${RUN}`, provider_status: '2', canal: 'olist', data: agora, valor_total: '7000', itens: [{ sku: `sku-cancel-${RUN}`, nome: 'Cancelado', quantidade: 70, valor: 100 }] },
    ]);
    const [report] = await tdb.insert(reports).values({ org_id: orgId, periodo_inicio: new Date('2026-07-01T00:00:00Z'), periodo_fim: new Date('2026-07-31T23:59:59Z') }).returning({ id: reports.id });
    reportId = report.id;
    await tdb.insert(trackedProducts).values([{ org_id: orgId, nome: 'Bling', sku: `sku-bling-${RUN}`, keywords: [], ativo: true }, { org_id: orgId, nome: 'Olist', sku: `sku-olist-${RUN}`, keywords: [], ativo: true }]);
    await tdb.insert(productStock).values([{ org_id: orgId, sku: `sku-bling-${RUN}`, nome: 'Bling', saldo: '10' }, { org_id: orgId, sku: `sku-olist-${RUN}`, nome: 'Olist', saldo: '10' }]);
  });
  afterAll(async () => { await tdb.delete(orders).where(eq(orders.org_id, orgId)); await tdb.delete(reports).where(eq(reports.org_id, orgId)); await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId)); await tdb.delete(productStock).where(eq(productStock.org_id, orgId)); await tdb.delete(connections).where(eq(connections.org_id, orgId)); await tdb.delete(organizations).where(eq(organizations.id, orgId)); for (const id of [...blockedOlistOrgIds, blingAfterBlockedOrgId]) { await tdb.delete(connections).where(eq(connections.org_id, id)); await tdb.delete(organizations).where(eq(organizations.id, id)); } await sql.end(); });

  it('selects only the active source and changes atomically after cutover', async () => {
    const { getActiveErpConnection, getActiveErpConnectionsForOrgIds, MAX_ACTIVE_ERP_BATCH } = await import('@/modules/connections/active-provider.repository');
    const { getTotaisSemanais, getUltimaDataPedido, getUltimaVendaPorSku } = await import('@/modules/alerts/alert-data.repository');
    const { getTotalVendasMesAnterior, getTotalVendasMesCorrente } = await import('@/modules/organizations/organization-settings.repository');
    const { getStockRows, getStockRowsBatch, getVendas30dPorSku, getVendas30dPorSkuBatch } = await import('@/modules/estoque/stock.repository');
    const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
    const bling = await getActiveErpConnection(orgId);
    expect(bling).toMatchObject({ provider: 'bling', sourceGeneration: 1 });
    expect((await getTotaisSemanais(bling!, agora)).total7dias).toBe(100);
    expect(await getTotalVendasMesCorrente(bling!, agora)).toBe(100);
    expect(await getTotalVendasMesAnterior(bling!, agora)).toBe(0);
    expect((await getUltimaVendaPorSku(bling!, 30, agora)).ultimaVendaPorSku.get(`sku-bling-${RUN}`)).toEqual(agora);
    expect(await getUltimaDataPedido(bling!)).toEqual(agora);
    expect((await getVendas30dPorSku(bling!, agora)).get(`sku-bling-${RUN}`)).toBe(1);
    expect((await getVendas30dPorSkuBatch([bling!], agora)).get(orgId)?.get(`sku-bling-${RUN}`)).toBe(1);
    expect((await getStockRows(bling!)).map((row) => row.sku)).toEqual(expect.arrayContaining([`sku-bling-${RUN}`]));
    expect((await getStockRowsBatch([bling!])).get(orgId)).toHaveLength(2);
    expect((await computeMetrics(bling!, reportId, { inicio: new Date('2026-07-01T00:00:00Z'), fim: new Date('2026-07-31T23:59:59Z') })).truth_score?.totalPeriodo).toBe(100);
    await tdb.transaction(async (tx) => {
      await tx.update(connections).set({ status: 'configurado' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      await tx.update(connections).set({ status: 'ok' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    });
    const olist = await getActiveErpConnection(orgId);
    expect(olist).toMatchObject({ provider: 'olist', sourceGeneration: 3 });
    expect((await getTotaisSemanais(olist!, agora)).total7dias).toBe(900);
    expect(await getTotalVendasMesCorrente(olist!, agora)).toBe(900);
    expect(await getTotalVendasMesAnterior(olist!, agora)).toBe(0);
    expect((await getUltimaVendaPorSku(olist!, 30, agora)).ultimaVendaPorSku.get(`sku-olist-${RUN}`)).toEqual(agora);
    expect(await getUltimaDataPedido(olist!)).toEqual(agora);
    expect((await getVendas30dPorSku(olist!, agora)).get(`sku-olist-${RUN}`)).toBe(9);
    expect((await getVendas30dPorSkuBatch([olist!], agora)).get(orgId)?.get(`sku-olist-${RUN}`)).toBe(9);
    expect((await computeMetrics(olist!, reportId, { inicio: new Date('2026-07-01T00:00:00Z'), fim: new Date('2026-07-31T23:59:59Z') })).truth_score?.totalPeriodo).toBe(900);
    expect(await getActiveErpConnectionsForOrgIds([orgId, orgId])).toEqual([
      expect.objectContaining({ orgId, provider: 'olist', sourceGeneration: 3 }),
    ]);
    await expect(getActiveErpConnectionsForOrgIds(Array.from({ length: MAX_ACTIVE_ERP_BATCH + 1 }, (_, i) => `org-${i}`))).rejects.toThrow('active_erp_batch_limit_exceeded');
  });

  it('exclui Olist bloqueado antes do limite sem esconder Bling posterior e aceita só a allowlist exata', async () => {
    const { listActiveErpConnections } = await import('@/modules/connections/active-provider.repository');
    const originalEnabled = serverEnv.OLIST_DATA_SYNC_ENABLED;
    const originalOrgIds = serverEnv.OLIST_DATA_SYNC_ORG_IDS;
    try {
      const blocked = await tdb.insert(organizations).values(
        Array.from({ length: 50 }, (_, index) => ({ name: `blocked-olist-${RUN}-${index}`, status: 'active' as const })),
      ).returning({ id: organizations.id });
      blockedOlistOrgIds = blocked.map((row) => row.id);
      await tdb.insert(connections).values(blockedOlistOrgIds.map((orgId) => ({ org_id: orgId, provider: 'olist' as const, access_token: 'test', status: 'ok' as const })));
      const [bling] = await tdb.insert(organizations).values({ name: `bling-after-blocked-${RUN}`, status: 'active' }).returning({ id: organizations.id });
      blingAfterBlockedOrgId = bling.id;
      await tdb.insert(connections).values({ org_id: blingAfterBlockedOrgId, provider: 'bling', access_token: 'test', status: 'ok' });

      serverEnv.OLIST_DATA_SYNC_ENABLED = false;
      serverEnv.OLIST_DATA_SYNC_ORG_IDS = [];
      const disabled = await listActiveErpConnections({ limit: 50 });
      expect(disabled).toEqual(expect.arrayContaining([expect.objectContaining({ orgId: blingAfterBlockedOrgId, provider: 'bling' })]));
      expect(disabled.some((source) => blockedOlistOrgIds.includes(source.orgId))).toBe(false);

      serverEnv.OLIST_DATA_SYNC_ENABLED = true;
      serverEnv.OLIST_DATA_SYNC_ORG_IDS = [blockedOlistOrgIds[0]!];
      const allowlisted = await listActiveErpConnections({ limit: 50 });
      expect(allowlisted).toEqual(expect.arrayContaining([
        expect.objectContaining({ orgId: blingAfterBlockedOrgId, provider: 'bling' }),
        expect.objectContaining({ orgId: blockedOlistOrgIds[0], provider: 'olist' }),
      ]));
      expect(allowlisted.filter((source) => source.provider === 'olist' && blockedOlistOrgIds.includes(source.orgId))).toHaveLength(1);
    } finally {
      serverEnv.OLIST_DATA_SYNC_ENABLED = originalEnabled;
      serverEnv.OLIST_DATA_SYNC_ORG_IDS = originalOrgIds;
    }
  });
});
