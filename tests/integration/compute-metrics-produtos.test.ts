import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { marketSnapshots, orders, organizations, reports, trackedProducts } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

const PERIODO = {
  inicio: new Date('2026-06-01T00:00:00Z'),
  fim: new Date('2026-06-14T23:59:59Z'),
};

describe.skipIf(!url)('compute-metrics — produtos v2 (integração)', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('computeMetrics devolve curvaAbc, frete, unidades, itensPorPedido e faixaMercado', async () => {
    let orgId = '';
    try {
      const [o] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-produtos-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgId = o.id;

      const [r] = await tdb
        .insert(reports)
        .values({ org_id: orgId, periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim })
        .returning({ id: reports.id });

      await tdb.insert(orders).values([
        {
          org_id: orgId,
          bling_order_id: `ta-test-produtos-${RUN}-1`,
          canal: 'shopee',
          data: new Date('2026-06-01T10:00:00Z'),
          valor_total: '200.00',
          frete: '15.00',
          itens: [{ sku: 'A1', nome: 'Produto A1', quantidade: 2, valor: 100 }],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-produtos-${RUN}-2`,
          canal: 'mercadolivre',
          data: new Date('2026-06-01T15:00:00Z'),
          valor_total: '50.00',
          frete: '5.00',
          itens: [{ sku: 'B1', nome: 'Produto B1', quantidade: 1, valor: 50 }],
        },
      ]);

      await tdb.insert(trackedProducts).values({
        org_id: orgId,
        nome: 'Produto A1',
        sku: 'A1',
        keywords: ['produto a1'],
        ativo: true,
      });

      await tdb.insert(marketSnapshots).values({
        org_id: orgId,
        report_id: r.id,
        fonte: 'ml_publico',
        keyword: 'produto a1',
        dados: { precos: [90, 110], quantidadeResultados: 2 },
      });

      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const m = await computeMetrics(orgId, r.id, PERIODO, true);

      expect(m.curvaAbc?.a[0].sku).toBe('A1');
      expect(m.frete?.freteMedio).toBe(10);
      expect(m.unidadesTotais).toBe(3);
      expect(m.itensPorPedido).toBe(1.5);
      expect(m.faixaMercado).toContainEqual({
        sku: 'A1',
        nome: 'Produto A1',
        min: 90,
        p25: 95,
        mediana: 100,
        p75: 105,
        fonte: 'ml_publico',
      });
    } finally {
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId));
      await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId));
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
      await tdb.delete(reports).where(eq(reports.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
  });
});
