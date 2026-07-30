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

// Período atual: 10 dias (2024-02-11 .. 2024-02-21).
// Período anterior (mesma duração, imediatamente antes): 2024-02-01 .. 2024-02-11.
const PERIODO = {
  inicio: new Date('2024-02-11T00:00:00Z'),
  fim: new Date('2024-02-21T00:00:00Z'),
};

describe.skipIf(!url)('compute-metrics — truth_score (integração)', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('Cenário A: sem report done anterior → totalPeriodoAnterior=null, crescimento neutro (15 pts)', async () => {
    let orgId = '';

    try {
      const [o] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-score-a-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgId = o.id;

      const [r] = await tdb
        .insert(reports)
        .values({ org_id: orgId, periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim })
        .returning({ id: reports.id });
      const reportId = r.id;

      // Orders no período atual: 100 + 200 + 300 = 600
      await tdb.insert(orders).values([
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-a-${RUN}-1`,
          canal: 'shopee',
          data: new Date('2024-02-12T00:00:00Z'),
          valor_total: '100.00',
          frete: '0.00',
          itens: [],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-a-${RUN}-2`,
          canal: 'shopee',
          data: new Date('2024-02-13T00:00:00Z'),
          valor_total: '200.00',
          frete: '0.00',
          itens: [],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-a-${RUN}-3`,
          canal: 'mercadolivre',
          data: new Date('2024-02-14T00:00:00Z'),
          valor_total: '300.00',
          frete: '0.00',
          itens: [],
        },
      ]);

      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const result = await computeMetrics(sourceFor(orgId), reportId, PERIODO, true);

      expect(result.truth_score).toBeDefined();
      expect(result.truth_score?.totalPeriodo).toBe(600);
      expect(result.truth_score?.totalPeriodoAnterior).toBeNull();
      expect(result.truth_score?.fatores.crescimento.pontos).toBe(15);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
      await tdb.delete(reports).where(eq(reports.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it('Cenário B: com report done anterior e 500 no período anterior → totalPeriodoAnterior=500, variação +20%', async () => {
    let orgId = '';

    try {
      const [o] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-score-b-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgId = o.id;

      // Report `done` antigo — presença dele habilita o cálculo do período anterior.
      await tdb.insert(reports).values({
        org_id: orgId,
        periodo_inicio: new Date('2024-01-01T00:00:00Z'),
        periodo_fim: new Date('2024-01-11T00:00:00Z'),
        status: 'done',
      });

      const [r] = await tdb
        .insert(reports)
        .values({ org_id: orgId, periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim })
        .returning({ id: reports.id });
      const reportId = r.id;

      await tdb.insert(orders).values([
        // Período atual: 100 + 200 + 300 = 600
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-b-${RUN}-1`,
          canal: 'shopee',
          data: new Date('2024-02-12T00:00:00Z'),
          valor_total: '100.00',
          frete: '0.00',
          itens: [],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-b-${RUN}-2`,
          canal: 'shopee',
          data: new Date('2024-02-13T00:00:00Z'),
          valor_total: '200.00',
          frete: '0.00',
          itens: [],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-b-${RUN}-3`,
          canal: 'mercadolivre',
          data: new Date('2024-02-14T00:00:00Z'),
          valor_total: '300.00',
          frete: '0.00',
          itens: [],
        },
        // Período anterior (2024-02-01 .. 2024-02-11): 200 + 300 = 500
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-b-${RUN}-prev-1`,
          canal: 'shopee',
          data: new Date('2024-02-05T00:00:00Z'),
          valor_total: '200.00',
          frete: '0.00',
          itens: [],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-score-b-${RUN}-prev-2`,
          canal: 'shopee',
          data: new Date('2024-02-06T00:00:00Z'),
          valor_total: '300.00',
          frete: '0.00',
          itens: [],
        },
      ]);

      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const result = await computeMetrics(sourceFor(orgId), reportId, PERIODO, true);

      expect(result.truth_score?.totalPeriodoAnterior).toBe(500);
      expect(result.truth_score?.fatores.crescimento.variacaoPercentual).toBe(20);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
      await tdb.delete(reports).where(eq(reports.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
  });
});
