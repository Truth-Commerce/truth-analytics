import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, reports } from '@/db/schema';
import type { Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('report.repository — integração', () => {
  let orgId = '';
  let orgBId = '';
  let doneReportId = '';
  let failedReportId = '';

  const PERIODO = {
    inicio: new Date('2026-06-01T00:00:00Z'),
    fim: new Date('2026-06-30T23:59:59Z'),
  };

  const METRICAS_SAMPLE: Metricas = {
    vendasPorCanal: [{ canal: 'shopee', total: 500, pedidos: 5 }],
    evolucao: [{ data: '2026-06-10', total: 500 }],
    ticketMedio: 100,
    topProdutos: [{ nome: 'Produto X', sku: 'SKU-X', quantidade: 5, receita: 500 }],
    posicaoPreco: [],
    benchmarkParcial: false,
  };

  const ANALISE_SAMPLE = {
    resumoExecutivo: 'Período positivo.',
    gargalos: ['Gargalo A'],
    sugestoesMelhoria: ['Melhoria A'],
    ideiasVenda: ['Ideia A'],
    recomendacoesPreco: [],
  };

  beforeAll(async () => {
    // Org A (principal)
    const [orgA] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-repo-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = orgA.id;

    // Org B (isolamento)
    const [orgB] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-repo-iso-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB.id;

    // Inserir failed PRIMEIRO para que done seja mais recente (created_at = now())
    const [failedRow] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: PERIODO.inicio,
        periodo_fim: PERIODO.fim,
        status: 'failed',
        metricas: null,
        analise_ia: null,
        erro: 'falha_geracao',
      })
      .returning({ id: reports.id });
    failedReportId = failedRow.id;

    // Inserir done por último — será o mais recente
    const [doneRow] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: PERIODO.inicio,
        periodo_fim: PERIODO.fim,
        status: 'done',
        metricas: METRICAS_SAMPLE,
        analise_ia: ANALISE_SAMPLE,
        erro: null,
      })
      .returning({ id: reports.id });
    doneReportId = doneRow.id;
  });

  afterAll(async () => {
    // Cleanup: reports antes das orgs (FK)
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(reports).where(eq(reports.org_id, orgBId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgBId));
    await sql.end();
  });

  it('listReports retorna 2 relatórios ordenados por created_at desc', async () => {
    const { listReports } = await import('@/modules/reports/report.repository');
    const list = await listReports(orgId);

    expect(list).toHaveLength(2);
    // done foi inserido por último → deve ser o primeiro (mais recente)
    expect(list[0].id).toBe(doneReportId);
    expect(list[0].status).toBe('done');
    expect(list[1].id).toBe(failedReportId);
    expect(list[1].status).toBe('failed');
  });

  it('getLatestReport retorna o relatório mais recente', async () => {
    const { getLatestReport } = await import('@/modules/reports/report.repository');
    const latest = await getLatestReport(orgId);

    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(doneReportId);
    expect(latest!.status).toBe('done');
  });

  it('getReportById do relatório done traz metricas e analiseIa não-nulos', async () => {
    const { getReportById } = await import('@/modules/reports/report.repository');
    const detail = await getReportById(doneReportId, orgId);

    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('done');
    expect(detail!.metricas).not.toBeNull();
    expect(detail!.analiseIa).not.toBeNull();
    expect(detail!.metricas!.ticketMedio).toBe(100);
    expect(detail!.analiseIa!.resumoExecutivo).toBe('Período positivo.');
    expect(detail!.erro).toBeNull();
  });

  it('getReportById do relatório failed tem erro não-nulo e metricas null', async () => {
    const { getReportById } = await import('@/modules/reports/report.repository');
    const detail = await getReportById(failedReportId, orgId);

    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('failed');
    expect(detail!.metricas).toBeNull();
    expect(detail!.analiseIa).toBeNull();
    expect(detail!.erro).toBe('falha_geracao');
  });

  it('isolamento: getReportById com orgId errado retorna null', async () => {
    const { getReportById } = await import('@/modules/reports/report.repository');
    // Relatório da org A não é acessível pela org B
    const result = await getReportById(doneReportId, orgBId);
    expect(result).toBeNull();
  });

  it('listReports de outra org retorna lista vazia', async () => {
    const { listReports } = await import('@/modules/reports/report.repository');
    const list = await listReports(orgBId);
    expect(list).toHaveLength(0);
  });

  it('getLatestReport de org sem relatórios retorna null', async () => {
    const { getLatestReport } = await import('@/modules/reports/report.repository');
    const result = await getLatestReport(orgBId);
    expect(result).toBeNull();
  });
});
