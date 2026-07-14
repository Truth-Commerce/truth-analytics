import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, reports } from '@/db/schema';
import type { Metricas } from '@/modules/pipeline/contracts';
import { computeTruthScore } from '@/modules/pipeline/steps/truth-score';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

const PERIODO = {
  inicio: new Date('2026-06-01T00:00:00Z'),
  fim: new Date('2026-06-30T23:59:59Z'),
};

function metricasComScore(marcador: string): Metricas {
  return {
    vendasPorCanal: [{ canal: 'shopee', total: 500, pedidos: 5 }],
    evolucao: [{ data: '2026-06-10', total: 500 }],
    ticketMedio: 100,
    topProdutos: [{ nome: marcador, sku: 'SKU-X', quantidade: 5, receita: 500 }],
    posicaoPreco: [],
    benchmarkParcial: false,
    truth_score: computeTruthScore({
      totalPeriodo: 500,
      totalPeriodoAnterior: null,
      vendasPorCanal: [{ canal: 'shopee', total: 500, pedidos: 5 }],
      evolucao: [{ data: '2026-06-10', total: 500 }],
      posicaoPreco: [],
      diasPeriodo: 30,
    }),
  };
}

describe.skipIf(!url)('report.repository — listDoneReports / getUltimosDoneDetalhados', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('listDoneReports retorna só summaries done (mais recente primeiro); getUltimosDoneDetalhados traz truth_score; org alheia isolada', async () => {
    let orgId = '';
    let orgOutraId = '';

    try {
      const [org] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-done-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgId = org.id;

      const [orgOutra] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-done-iso-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgOutraId = orgOutra.id;

      const base = { org_id: orgId, periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim };

      const [doneAntigo] = await tdb
        .insert(reports)
        .values({
          ...base,
          status: 'done',
          metricas: metricasComScore('antigo'),
          created_at: new Date('2026-06-24T00:00:00.000Z'),
        })
        .returning({ id: reports.id });

      const [falho] = await tdb
        .insert(reports)
        .values({
          ...base,
          status: 'failed',
          erro: 'falha_geracao',
          created_at: new Date('2026-06-24T00:00:01.000Z'),
        })
        .returning({ id: reports.id });

      const [doneRecente] = await tdb
        .insert(reports)
        .values({
          ...base,
          status: 'done',
          metricas: metricasComScore('recente'),
          created_at: new Date('2026-06-24T00:00:02.000Z'),
        })
        .returning({ id: reports.id });

      const { listDoneReports, getUltimosDoneDetalhados } = await import(
        '@/modules/reports/report.repository'
      );

      // listDoneReports — só done, recente primeiro
      const summaries = await listDoneReports(orgId);
      expect(summaries).toHaveLength(2);
      expect(summaries[0].id).toBe(doneRecente.id);
      expect(summaries[1].id).toBe(doneAntigo.id);
      expect(summaries.every((s) => s.status === 'done')).toBe(true);
      expect(summaries.some((s) => s.id === falho.id)).toBe(false);

      // getUltimosDoneDetalhados — traz metricas.truth_score.score preenchido
      const detalhados = await getUltimosDoneDetalhados(orgId, 2);
      expect(detalhados).toHaveLength(2);
      expect(detalhados[0].id).toBe(doneRecente.id);
      expect(detalhados[0].metricas?.truth_score?.score).toBeTypeOf('number');
      expect(detalhados[1].id).toBe(doneAntigo.id);
      expect(detalhados[1].metricas?.truth_score?.score).toBeTypeOf('number');

      // Isolamento: org alheia não vê nada
      expect(await listDoneReports(orgOutraId)).toEqual([]);
      expect(await getUltimosDoneDetalhados(orgOutraId, 2)).toEqual([]);
    } finally {
      if (orgId) await tdb.delete(reports).where(eq(reports.org_id, orgId));
      if (orgOutraId) await tdb.delete(reports).where(eq(reports.org_id, orgOutraId));
      if (orgId) await tdb.delete(organizations).where(eq(organizations.id, orgId));
      if (orgOutraId) await tdb.delete(organizations).where(eq(organizations.id, orgOutraId));
    }
  });
});
