import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, reports } from '@/db/schema';
import type { Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

const PERIODO = {
  inicio: new Date('2026-06-01T00:00:00Z'),
  fim: new Date('2026-06-30T23:59:59Z'),
};

// Shape mínimo válido (mesmos campos do SAMPLE_METRICAS do e2e).
function metricas(total: number): Metricas {
  return {
    vendasPorCanal: [{ canal: 'shopee', total, pedidos: 5 }],
    evolucao: [{ data: '2026-06-10', total }],
    ticketMedio: 100,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
  };
}

describe.skipIf(!url)('report.repository — getDoneAnterior', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('retorna o done imediatamente anterior por created_at (pula o failed), null quando não há anterior, e isola por org', async () => {
    let orgId = '';
    let outraOrgId = '';

    try {
      const [org] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-anterior-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgId = org.id;

      const [outraOrg] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-anterior-iso-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      outraOrgId = outraOrg.id;

      const base = { org_id: orgId, periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim };

      // created_at explícitos e crescentes; o failed cai ENTRE o segundo e o
      // terceiro (se o filtro de status quebrasse, ele seria retornado).
      const [primeiro] = await tdb
        .insert(reports)
        .values({ ...base, status: 'done', metricas: metricas(800), created_at: new Date('2026-06-01T00:00:00.000Z') })
        .returning({ id: reports.id, created_at: reports.created_at });
      const [segundo] = await tdb
        .insert(reports)
        .values({ ...base, status: 'done', metricas: metricas(1000), created_at: new Date('2026-06-08T00:00:00.000Z') })
        .returning({ id: reports.id, created_at: reports.created_at });
      await tdb
        .insert(reports)
        .values({ ...base, status: 'failed', erro: 'falha_geracao', created_at: new Date('2026-06-12T00:00:00.000Z') });
      const [terceiro] = await tdb
        .insert(reports)
        .values({ ...base, status: 'done', metricas: metricas(1500), created_at: new Date('2026-06-15T00:00:00.000Z') })
        .returning({ id: reports.id, created_at: reports.created_at });

      const { getDoneAnterior } = await import('@/modules/reports/report.repository');

      // Anterior ao terceiro: pula o failed (mais recente) → segundo done.
      const anterior = await getDoneAnterior(orgId, terceiro.created_at, terceiro.id);
      expect(anterior?.id).toBe(segundo.id);

      // Nada anterior ao primeiro.
      const nenhum = await getDoneAnterior(orgId, primeiro.created_at, primeiro.id);
      expect(nenhum).toBeNull();

      // Isolamento multi-tenant: outra org não enxerga.
      const outra = await getDoneAnterior(outraOrgId, terceiro.created_at, terceiro.id);
      expect(outra).toBeNull();
    } finally {
      if (orgId) await tdb.delete(reports).where(eq(reports.org_id, orgId));
      if (outraOrgId) await tdb.delete(reports).where(eq(reports.org_id, outraOrgId));
      if (orgId) await tdb.delete(organizations).where(eq(organizations.id, orgId));
      if (outraOrgId) await tdb.delete(organizations).where(eq(organizations.id, outraOrgId));
    }
  });
});
