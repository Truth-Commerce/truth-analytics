import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  marketSnapshots,
  orders,
  organizations,
  reports,
  trackedProducts,
} from '@/db/schema';
import { MetricasSchema } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('compute-metrics — integração', () => {
  let orgId = '';
  let orgId2 = '';
  let reportId = '';
  let reportId2 = '';

  const PERIODO = {
    inicio: new Date('2024-01-01T00:00:00Z'),
    fim: new Date('2024-01-31T23:59:59Z'),
  };

  beforeAll(async () => {
    // ---- Primary org ----
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-compute-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = o.id;

    const [r] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: PERIODO.inicio,
        periodo_fim: PERIODO.fim,
      })
      .returning({ id: reports.id });
    reportId = r.id;

    // ---- Isolation org ----
    const [o2] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-compute-iso-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId2 = o2.id;

    const [r2] = await tdb
      .insert(reports)
      .values({
        org_id: orgId2,
        periodo_inicio: PERIODO.inicio,
        periodo_fim: PERIODO.fim,
      })
      .returning({ id: reports.id });
    reportId2 = r2.id;
  });

  afterAll(async () => {
    // Clean up in dependency order
    await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId));
    await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId2));
    await tdb.delete(orders).where(eq(orders.org_id, orgId));
    await tdb.delete(orders).where(eq(orders.org_id, orgId2));
    await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId));
    await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId2));
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(reports).where(eq(reports.org_id, orgId2));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId2));
    await sql.end();
  });

  it('Teste A: métricas calculadas batem com valores esperados', async () => {
    // Seed orders for primary org
    await tdb.insert(orders).values([
      {
        org_id: orgId,
        bling_order_id: `cm-order-${RUN}-1`,
        canal: 'shopee',
        data: new Date('2024-01-10T00:00:00Z'),
        valor_total: '200.00',
        frete: '10.00',
        itens: [
          { sku: 'SKU-A', nome: 'Produto A', quantidade: 2, valor: 90 },
          { sku: 'SKU-B', nome: 'Produto B', quantidade: 1, valor: 20 },
        ],
      },
      {
        org_id: orgId,
        bling_order_id: `cm-order-${RUN}-2`,
        canal: 'mercadolivre',
        data: new Date('2024-01-10T12:00:00Z'),
        valor_total: '300.00',
        frete: '0.00',
        itens: [{ sku: 'SKU-A', nome: 'Produto A', quantidade: 1, valor: 300 }],
      },
      {
        org_id: orgId,
        bling_order_id: `cm-order-${RUN}-3`,
        canal: 'shopee',
        data: new Date('2024-01-15T00:00:00Z'),
        valor_total: '150.00',
        frete: '5.00',
        itens: [{ sku: 'SKU-B', nome: 'Produto B', quantidade: 3, valor: 50 }],
      },
    ]);

    // Seed tracked products
    const [tp] = await tdb
      .insert(trackedProducts)
      .values({
        org_id: orgId,
        nome: 'Produto A',
        sku: 'SKU-A',
        keywords: [`kw-a-${RUN}`],
        ativo: true,
      })
      .returning({ id: trackedProducts.id });

    // Seed market snapshots
    await tdb.insert(marketSnapshots).values([
      {
        org_id: orgId,
        report_id: reportId,
        fonte: 'serpapi',
        keyword: `kw-a-${RUN}`,
        dados: { precos: [100, 200, 300] },
      },
      {
        org_id: orgId,
        report_id: reportId,
        fonte: 'ml_publico',
        keyword: `kw-a-${RUN}`,
        dados: { precos: [150, 250] },
      },
    ]);

    try {
      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const result = await computeMetrics(orgId, reportId, PERIODO);

      // MetricasSchema must parse successfully
      expect(() => MetricasSchema.parse(result)).not.toThrow();

      // ticketMedio: (200 + 300 + 150) / 3 = 216.67
      expect(result.ticketMedio).toBe(216.67);

      // benchmarkParcial: has snapshots → false (not overridden)
      expect(result.benchmarkParcial).toBe(false);

      // vendasPorCanal: shopee=(200+150)=350 pedidos=2; mercadolivre=300 pedidos=1
      const shopee = result.vendasPorCanal.find((v) => v.canal === 'shopee');
      const ml = result.vendasPorCanal.find((v) => v.canal === 'mercadolivre');
      expect(shopee).toEqual({ canal: 'shopee', total: 350, pedidos: 2 });
      expect(ml).toEqual({ canal: 'mercadolivre', total: 300, pedidos: 1 });

      // evolucao: 2024-01-10=(200+300)=500; 2024-01-15=150
      const dia10 = result.evolucao.find((e) => e.data === '2024-01-10');
      const dia15 = result.evolucao.find((e) => e.data === '2024-01-15');
      expect(dia10).toEqual({ data: '2024-01-10', total: 500 });
      expect(dia15).toEqual({ data: '2024-01-15', total: 150 });
      // sorted ascending
      expect(result.evolucao[0].data).toBe('2024-01-10');
      expect(result.evolucao[1].data).toBe('2024-01-15');

      // topProdutos:
      // SKU-A: qtd=3, receita=(2*90)+(1*300)=480
      // SKU-B: qtd=4, receita=(1*20)+(3*50)=170
      expect(result.topProdutos).toHaveLength(2);
      expect(result.topProdutos[0]).toEqual({ nome: 'Produto A', sku: 'SKU-A', quantidade: 3, receita: 480 });
      expect(result.topProdutos[1]).toEqual({ nome: 'Produto B', sku: 'SKU-B', quantidade: 4, receita: 170 });

      // posicaoPreco for SKU-A:
      // nossoPreco: unit prices from order itens = [90, 90, 300, 300] — wait, 2 items of qty but valor is unit price
      // Order 1: SKU-A, quantidade=2, valor=90 → unit price=90
      // Order 2: SKU-A, quantidade=1, valor=300 → unit price=300
      // nossoPreco = avg([90, 300]) = 195
      // precoMercadoMediano: from both snapshots: [100,200,300,150,250] sorted=[100,150,200,250,300] → 200
      // fonte: serpapi=1, ml_publico=1 → tie → ml_publico < serpapi
      const posA = result.posicaoPreco.find((p) => p.sku === 'SKU-A');
      expect(posA).toBeDefined();
      expect(posA?.nossoPreco).toBe(195);
      expect(posA?.precoMercadoMediano).toBe(200);
      expect(posA?.fonte).toBe('ml_publico');
      expect(posA?.nome).toBe('Produto A');
    } finally {
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.report_id, reportId));
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
      await tdb.delete(trackedProducts).where(eq(trackedProducts.id, tp.id));
    }
  });

  it('Teste B: sem snapshots → benchmarkParcial=true (derivado)', async () => {
    // Seed just one order, no snapshots
    await tdb.insert(orders).values({
      org_id: orgId,
      bling_order_id: `cm-order-${RUN}-b`,
      canal: 'bling',
      data: new Date('2024-01-05T00:00:00Z'),
      valor_total: '99.90',
      frete: '0.00',
      itens: [],
    });

    try {
      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const result = await computeMetrics(orgId, reportId, PERIODO);

      expect(() => MetricasSchema.parse(result)).not.toThrow();
      expect(result.benchmarkParcial).toBe(true);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
    }
  });

  it('Teste C: benchmarkParcial override ignorado quando passado explicitamente', async () => {
    // No snapshots but we pass benchmarkParcial=false explicitly
    await tdb.insert(orders).values({
      org_id: orgId,
      bling_order_id: `cm-order-${RUN}-c`,
      canal: 'bling',
      data: new Date('2024-01-20T00:00:00Z'),
      valor_total: '50.00',
      frete: '0.00',
      itens: [],
    });

    try {
      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const result = await computeMetrics(orgId, reportId, PERIODO, false);
      expect(result.benchmarkParcial).toBe(false);

      const result2 = await computeMetrics(orgId, reportId, PERIODO, true);
      expect(result2.benchmarkParcial).toBe(true);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
    }
  });

  it('Teste D: pedidos fora do período são excluídos', async () => {
    // Order OUTSIDE the periodo
    await tdb.insert(orders).values({
      org_id: orgId,
      bling_order_id: `cm-order-${RUN}-out`,
      canal: 'shopee',
      data: new Date('2024-03-01T00:00:00Z'), // outside Jan
      valor_total: '9999.00',
      frete: '0.00',
      itens: [],
    });

    try {
      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const result = await computeMetrics(orgId, reportId, PERIODO);

      // no orders in January for this org → ticket 0, empty arrays
      expect(result.ticketMedio).toBe(0);
      expect(result.vendasPorCanal).toEqual([]);
      expect(result.evolucao).toEqual([]);
      expect(result.topProdutos).toEqual([]);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
    }
  });

  it('Teste E (isolamento): dados de outra org não vazam', async () => {
    // Seed data for org2
    await tdb.insert(orders).values({
      org_id: orgId2,
      bling_order_id: `cm-order-${RUN}-iso`,
      canal: 'canal-iso',
      data: new Date('2024-01-10T00:00:00Z'),
      valor_total: '50000.00',
      frete: '0.00',
      itens: [{ sku: 'SKU-ISO', nome: 'Produto Iso', quantidade: 100, valor: 500 }],
    });

    await tdb.insert(marketSnapshots).values({
      org_id: orgId2,
      report_id: reportId2,
      fonte: 'serpapi',
      keyword: `kw-iso-${RUN}`,
      dados: { precos: [99999] },
    });

    try {
      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');

      // Compute metrics for org1 (with no data seeded here)
      const result = await computeMetrics(orgId, reportId, PERIODO);

      expect(() => MetricasSchema.parse(result)).not.toThrow();

      // org1 has no orders → all aggregations empty/zero
      expect(result.ticketMedio).toBe(0);
      expect(result.vendasPorCanal).toEqual([]);
      expect(result.topProdutos).toEqual([]);
      expect(result.evolucao).toEqual([]);

      // posicaoPreco must not contain org2 data
      const hasIso = result.posicaoPreco.some((p) => p.sku === 'SKU-ISO');
      expect(hasIso).toBe(false);
    } finally {
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId2));
      await tdb.delete(orders).where(eq(orders.org_id, orgId2));
    }
  });
});
