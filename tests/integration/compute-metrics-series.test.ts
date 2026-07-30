import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { orders, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();
const sourceFor = (orgId: string) => ({ orgId, provider: 'bling' as const, sourceGeneration: 1 });

const PERIODO = {
  inicio: new Date('2026-06-01T00:00:00Z'),
  fim: new Date('2026-06-14T23:59:59Z'),
};

describe.skipIf(!url)('compute-metrics — séries v2 (integração)', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('computeMetrics devolve evolucaoDetalhada, canalPorDia, porDiaSemana e ticketPorCanal', async () => {
    let orgId = '';
    try {
      const [o] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-series-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgId = o.id;

      const [r] = await tdb
        .insert(reports)
        .values({ org_id: orgId, periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim })
        .returning({ id: reports.id });

      await tdb.insert(orders).values([
        {
          org_id: orgId,
          bling_order_id: `ta-test-series-${RUN}-1`,
          canal: 'shopee',
          data: new Date('2026-06-01T10:00:00Z'),
          valor_total: '100.00',
          frete: '10.00',
          itens: [],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-series-${RUN}-2`,
          canal: 'mercadolivre',
          data: new Date('2026-06-01T15:00:00Z'),
          valor_total: '200.00',
          frete: '20.00',
          itens: [],
        },
      ]);

      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const m = await computeMetrics(sourceFor(orgId), r.id, PERIODO, true);

      expect(m.evolucaoDetalhada).toEqual([{ data: '2026-06-01', total: 300, pedidos: 2 }]);
      expect(m.canalPorDia).toEqual([
        { data: '2026-06-01', canais: { mercadolivre: 200, shopee: 100 } },
      ]);
      expect(m.porDiaSemana?.find((d) => d.diaSemana === 1)).toEqual({
        diaSemana: 1,
        label: 'seg',
        mediaVendas: 150,
        totalVendas: 300,
      });
      // 1 pedido shopee de 100 → ticket 100 (o brief da task previa 150 por engano,
      // copiado do cenário unitário que tem 3 pedidos shopee).
      expect(m.ticketPorCanal).toEqual([
        { canal: 'mercadolivre', ticket: 200 },
        { canal: 'shopee', ticket: 100 },
      ]);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
      await tdb.delete(reports).where(eq(reports.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
  });
});
