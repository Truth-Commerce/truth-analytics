import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const db = drizzle(sql);
const RUN = Date.now();
const periodo = { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T23:59:59Z') };

// Também demonstra isolamento do provider ativo: trocar a conexão durante a coleta
// não altera a fonte congelada no claim.
describe.skipIf(!url)('pipeline Olist — fonte congelada no claim e falhas de coleta', () => {
  let orgId = '';

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({
      name: `ta-pipeline-olist-${RUN}`, status: 'active', plano: 'weekly', nicho: 'casa',
    }).returning({ id: organizations.id });
    orgId = org.id;
    await db.insert(connections).values({
      org_id: orgId, provider: 'olist', data_generation: 3, access_token: 'token', status: 'ok',
      last_sync_at: new Date('2026-07-01T10:00:00Z'),
    });
  });

  beforeEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    vi.restoreAllMocks();
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(connections).where(eq(connections.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('keeps the claimed Olist generation after active connection changes and never reads an old generation', async () => {
    const [queued] = await db.insert(reports).values({
      org_id: orgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim,
    }).returning({ id: reports.id });
    const collect = await import('@/modules/pipeline/steps/collect-orders');
    const metrics = await import('@/modules/pipeline/steps/compute-metrics');
    const market = await import('@/modules/pipeline/steps/collect-market');
    const orgs = await import('@/modules/admin/admin.repository');
    const analysis = await import('@/modules/pipeline/steps/analysis-context');
    const ia = await import('@/modules/pipeline/steps/analyze-ia');
    const enrich = await import('@/modules/pipeline/steps/enrich-orders');
    const finalize = await import('@/modules/pipeline/steps/finalize');
    const extras = await import('@/modules/pipeline/steps/pos-finalize-extras');
    vi.spyOn(orgs, 'getOrganizationById').mockResolvedValue({ id: orgId, name: 'Org Olist', plano: 'weekly', nicho: 'casa' } as never);
    vi.spyOn(market, 'collectMarket').mockResolvedValue({ benchmarkParcial: true } as never);
    vi.spyOn(enrich, 'enrichOrders').mockResolvedValue({ processados: 0, incompleto: false } as never);
    vi.spyOn(analysis, 'buildAnalysisContext').mockResolvedValue({} as never);
    vi.spyOn(ia, 'analyzeWithIA').mockResolvedValue({ analise: { resumoExecutivo: 'ok', gargalos: [], sugestoesMelhoria: [], ideiasVenda: [], recomendacoesPreco: [] }, usage: {} } as never);
    vi.spyOn(finalize, 'finalize').mockImplementation(async ({ reportId }) => {
      await db.update(reports).set({ status: 'done', etapa: null }).where(eq(reports.id, reportId));
    });
    vi.spyOn(extras, 'executarExtrasPosFinalize').mockResolvedValue(undefined);
    const collectSpy = vi.spyOn(collect, 'collectOrders').mockImplementation(async (source) => {
      expect(source).toEqual({ orgId, provider: 'olist', sourceGeneration: 3 });
      await db.update(connections).set({ status: 'erro' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
      await db.insert(connections).values({ org_id: orgId, provider: 'bling', data_generation: 1, access_token: 'new-token', status: 'ok' });
      return { processados: 0, total: 0 };
    });
    const metricSpy = vi.spyOn(metrics, 'computeMetrics').mockResolvedValue({ ticketMedio: 0, topProdutos: [] } as never);

    const { generateReport } = await import('@/modules/pipeline/orchestrator');
    await expect(generateReport(queued.id)).resolves.toMatchObject({ status: 'done' });
    expect(collectSpy).toHaveBeenCalledWith({ orgId, provider: 'olist', sourceGeneration: 3 }, periodo, expect.any(Object));
    expect(metricSpy).toHaveBeenCalledWith({ orgId, provider: 'olist', sourceGeneration: 3 }, queued.id, periodo, true);
    const [stored] = await db.select({ provider: reports.source_provider, generation: reports.source_generation }).from(reports).where(eq(reports.id, queued.id));
    expect(stored).toEqual({ provider: 'olist', generation: 3 });
  });

  it('fails the report when Olist collection is incomplete and does not publish freshness', async () => {
    await db.update(connections).set({ status: 'erro' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
    await db.update(connections).set({ status: 'ok', last_sync_at: new Date('2026-07-01T10:00:00Z') }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    const [queued] = await db.insert(reports).values({ org_id: orgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim }).returning({ id: reports.id });
    const collect = await import('@/modules/pipeline/steps/collect-orders');
    const collectSpy = vi.spyOn(collect, 'collectOrders').mockResolvedValue({ processados: 1, total: 2, incompleto: true });
    const { generateReport } = await import('@/modules/pipeline/orchestrator');
    await expect(generateReport(queued.id)).resolves.toMatchObject({ status: 'failed' });
    expect(collectSpy).toHaveBeenCalledTimes(1);
    const [stored] = await db.select({ status: reports.status, erro: reports.erro }).from(reports).where(eq(reports.id, queued.id));
    expect(stored).toEqual({ status: 'failed', erro: 'olist_listagem_incompleta' });
    const [connection] = await db.select({ last: connections.last_sync_at }).from(connections).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    expect(connection.last).toEqual(new Date('2026-07-01T10:00:00Z'));
  });
});
