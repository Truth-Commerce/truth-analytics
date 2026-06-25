import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { marketSnapshots, organizations, reports, trackedProducts } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('collect-market — integração', () => {
  let orgId = '';
  let orgId2 = '';
  let reportId = '';
  let reportId2 = '';

  beforeAll(async () => {
    // Seed primary org
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-market-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = o.id;

    // Seed report for primary org
    const [r] = await tdb
      .insert(reports)
      .values({ org_id: orgId, periodo_inicio: new Date('2024-01-01'), periodo_fim: new Date('2024-01-31') })
      .returning({ id: reports.id });
    reportId = r.id;

    // Seed isolation org
    const [o2] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-market-iso-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId2 = o2.id;

    // Seed report for isolation org
    const [r2] = await tdb
      .insert(reports)
      .values({ org_id: orgId2, periodo_inicio: new Date('2024-01-01'), periodo_fim: new Date('2024-01-31') })
      .returning({ id: reports.id });
    reportId2 = r2.id;
  });

  afterAll(async () => {
    await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId));
    await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId2));
    await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId));
    await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId2));
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(reports).where(eq(reports.org_id, orgId2));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId2));
    await sql.end();
  });

  it('Teste A: 1 provedor ok + 1 lançando → snapshots só do ok, benchmarkParcial=true', async () => {
    // Seed a tracked product with 1 keyword for this test
    const [tp] = await tdb
      .insert(trackedProducts)
      .values({
        org_id: orgId,
        nome: `Produto A ${RUN}`,
        sku: `SKU-A-${RUN}`,
        keywords: [`keyword-a-${RUN}`],
        ativo: true,
      })
      .returning({ id: trackedProducts.id });

    try {
      const serpapi = await import('@/modules/market/serpapi');
      const mlPublico = await import('@/modules/market/ml-publico');

      vi.spyOn(serpapi.serpapiProvider, 'search').mockResolvedValueOnce({
        precos: [99.9, 109.9],
        bruto: { shopping_results: [{ price: 99.9 }, { price: 109.9 }] },
      });
      vi.spyOn(mlPublico.mlPublicoProvider, 'search').mockRejectedValueOnce(
        new Error('ml_publico_erro_503'),
      );

      const { collectMarket } = await import('@/modules/pipeline/steps/collect-market');
      const result = await collectMarket(orgId, reportId, [
        serpapi.serpapiProvider,
        mlPublico.mlPublicoProvider,
      ]);

      expect(result.benchmarkParcial).toBe(true);

      const rows = await tdb
        .select()
        .from(marketSnapshots)
        .where(eq(marketSnapshots.report_id, reportId));

      // Only serpapi snapshot, no ml_publico
      expect(rows.length).toBe(1);
      expect(rows[0].fonte).toBe('serpapi');
      expect(rows[0].keyword).toBe(`keyword-a-${RUN}`);
      const dados = rows[0].dados as { precos: number[] };
      expect(dados.precos).toEqual([99.9, 109.9]);
    } finally {
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.report_id, reportId));
      await tdb.delete(trackedProducts).where(eq(trackedProducts.id, tp.id));
    }
  });

  it('Teste B: ambos os provedores ok → snapshots de cada provedor/keyword, benchmarkParcial=false', async () => {
    // Seed a tracked product with 2 keywords
    const [tp] = await tdb
      .insert(trackedProducts)
      .values({
        org_id: orgId,
        nome: `Produto B ${RUN}`,
        sku: `SKU-B-${RUN}`,
        keywords: [`keyword-b1-${RUN}`, `keyword-b2-${RUN}`],
        ativo: true,
      })
      .returning({ id: trackedProducts.id });

    try {
      const serpapi = await import('@/modules/market/serpapi');
      const mlPublico = await import('@/modules/market/ml-publico');

      // 2 keywords × 2 providers = 4 calls → 4 mock results
      vi.spyOn(serpapi.serpapiProvider, 'search')
        .mockResolvedValueOnce({ precos: [50.0], bruto: {} })
        .mockResolvedValueOnce({ precos: [60.0], bruto: {} });

      vi.spyOn(mlPublico.mlPublicoProvider, 'search')
        .mockResolvedValueOnce({ precos: [48.0], bruto: {} })
        .mockResolvedValueOnce({ precos: [58.0], bruto: {} });

      const { collectMarket } = await import('@/modules/pipeline/steps/collect-market');
      const result = await collectMarket(orgId, reportId, [
        serpapi.serpapiProvider,
        mlPublico.mlPublicoProvider,
      ]);

      expect(result.benchmarkParcial).toBe(false);

      const rows = await tdb
        .select()
        .from(marketSnapshots)
        .where(eq(marketSnapshots.report_id, reportId));

      // 2 keywords × 2 providers = 4 snapshots
      expect(rows.length).toBe(4);

      const fontes = rows.map((r) => r.fonte);
      expect(fontes.filter((f) => f === 'serpapi').length).toBe(2);
      expect(fontes.filter((f) => f === 'ml_publico').length).toBe(2);

      const keywords = rows.map((r) => r.keyword);
      expect(keywords.filter((k) => k === `keyword-b1-${RUN}`).length).toBe(2);
      expect(keywords.filter((k) => k === `keyword-b2-${RUN}`).length).toBe(2);
    } finally {
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.report_id, reportId));
      await tdb.delete(trackedProducts).where(eq(trackedProducts.id, tp.id));
    }
  });

  it('Teste C: org sem produtos ativos → zero snapshots e benchmarkParcial=true', async () => {
    // Seed an INACTIVE tracked product for orgId2
    const [tp] = await tdb
      .insert(trackedProducts)
      .values({
        org_id: orgId2,
        nome: `Produto Inativo ${RUN}`,
        sku: `SKU-C-${RUN}`,
        keywords: [`keyword-c-${RUN}`],
        ativo: false,
      })
      .returning({ id: trackedProducts.id });

    try {
      const serpapi = await import('@/modules/market/serpapi');
      const mlPublico = await import('@/modules/market/ml-publico');

      const serpSpy = vi.spyOn(serpapi.serpapiProvider, 'search').mockResolvedValue({
        precos: [100.0],
        bruto: {},
      });
      const mlSpy = vi.spyOn(mlPublico.mlPublicoProvider, 'search').mockResolvedValue({
        precos: [95.0],
        bruto: {},
      });

      const { collectMarket } = await import('@/modules/pipeline/steps/collect-market');
      const result = await collectMarket(orgId2, reportId2, [
        serpapi.serpapiProvider,
        mlPublico.mlPublicoProvider,
      ]);

      // No active products → no provider calls → no snapshots → benchmarkParcial
      expect(result.benchmarkParcial).toBe(true);
      expect(serpSpy).not.toHaveBeenCalled();
      expect(mlSpy).not.toHaveBeenCalled();

      const rows = await tdb
        .select()
        .from(marketSnapshots)
        .where(eq(marketSnapshots.org_id, orgId2));
      expect(rows.length).toBe(0);
    } finally {
      await tdb.delete(trackedProducts).where(eq(trackedProducts.id, tp.id));
    }
  });

  it('Teste D (isolamento): snapshots de uma org não aparecem para outra org', async () => {
    // Seed products in both orgs
    const [tp1] = await tdb
      .insert(trackedProducts)
      .values({
        org_id: orgId,
        nome: `Produto Iso1 ${RUN}`,
        sku: `SKU-ISO1-${RUN}`,
        keywords: [`keyword-iso-${RUN}`],
        ativo: true,
      })
      .returning({ id: trackedProducts.id });

    const [tp2] = await tdb
      .insert(trackedProducts)
      .values({
        org_id: orgId2,
        nome: `Produto Iso2 ${RUN}`,
        sku: `SKU-ISO2-${RUN}`,
        keywords: [`keyword-iso-${RUN}`],
        ativo: true,
      })
      .returning({ id: trackedProducts.id });

    try {
      const serpapi = await import('@/modules/market/serpapi');

      vi.spyOn(serpapi.serpapiProvider, 'search').mockResolvedValue({
        precos: [200.0],
        bruto: {},
      });

      const { collectMarket } = await import('@/modules/pipeline/steps/collect-market');

      // Run only for org1
      await collectMarket(orgId, reportId, [serpapi.serpapiProvider]);

      const rowsOrg1 = await tdb
        .select()
        .from(marketSnapshots)
        .where(eq(marketSnapshots.org_id, orgId));

      const rowsOrg2 = await tdb
        .select()
        .from(marketSnapshots)
        .where(eq(marketSnapshots.org_id, orgId2));

      // org1 has snapshots, org2 has none
      expect(rowsOrg1.length).toBeGreaterThan(0);
      expect(rowsOrg1.every((r) => r.org_id === orgId)).toBe(true);
      expect(rowsOrg2.length).toBe(0);
    } finally {
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId));
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId2));
      await tdb.delete(trackedProducts).where(eq(trackedProducts.id, tp1.id));
      await tdb.delete(trackedProducts).where(eq(trackedProducts.id, tp2.id));
    }
  });
});
