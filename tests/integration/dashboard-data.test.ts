import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { connections, orders, organizations, reports } from '@/db/schema';
import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-dash-vm-';
const DIA = 86_400_000;

function metricasComScore(total: number, score: number, totalAnterior: number | null) {
  return {
    vendasPorCanal: [{ canal: 'shopee', total, pedidos: 10 }],
    evolucao: [{ data: '2026-06-01', total }],
    ticketMedio: total / 10,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    truth_score: {
      score,
      totalPeriodo: total,
      totalPeriodoAnterior: totalAnterior,
      fatores: {
        crescimento: { pontos: 10, max: 25, variacaoPercentual: 10 },
        posicaoPreco: { pontos: 10, max: 25, itensAvaliados: 1 },
        diversificacao: { pontos: 10, max: 20, canaisComVenda: 1 },
        regularidade: { pontos: 10, max: 20, diasComVenda: 5, diasPeriodo: 7 },
        cobertura: { pontos: 5, max: 10, produtosComBenchmark: 1, produtosAvaliados: 1 },
      },
    },
  };
}

describe.skipIf(!url)('getDashboardData — view-model único do dashboard', () => {
  let orgId = '';
  let outraOrgId = '';
  let doneRecenteId = '';
  let failedId = '';

  beforeAll(async () => {
    const agora = new Date();
    const [org] = await db
      .insert(organizations)
      .values({
        name: `${PREFIX}org-${RUN}`,
        status: 'active',
        plano: 'weekly',
        meta_mensal: '45000.00',
      })
      .returning({ id: organizations.id });
    orgId = org!.id;

    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'tok-fake',
      refresh_token: 'rt-fake',
      status: 'ok',
      expira_em: new Date(agora.getTime() + 30 * DIA),
      last_sync_at: agora,
    });

    // 3 relatórios: done antigo (58/800) → done recente (76/1000) → failed (mais novo)
    const base = { org_id: orgId, periodo_inicio: new Date(agora.getTime() - 8 * DIA), periodo_fim: new Date(agora.getTime() - DIA) };
    const [antigo] = await db
      .insert(reports)
      .values({ ...base, status: 'done', metricas: metricasComScore(800, 58, null), created_at: new Date(agora.getTime() - 3 * DIA) })
      .returning({ id: reports.id });
    const [recente] = await db
      .insert(reports)
      .values({ ...base, status: 'done', metricas: metricasComScore(1000, 76, 800), created_at: new Date(agora.getTime() - 2 * DIA) })
      .returning({ id: reports.id });
    doneRecenteId = recente!.id;
    const [failed] = await db
      .insert(reports)
      .values({ ...base, status: 'failed', erro: 'coleta_falhou', created_at: new Date(agora.getTime() - DIA) })
      .returning({ id: reports.id });
    failedId = failed!.id;
    void antigo;

    // Pedidos: 2 no mês corrente BRT (100.50 + 200) e 1 no mês anterior (999 — fora da soma)
    const hoje = hojeBrt(agora);
    const inicioMes = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
    const mesAnterior = new Date(inicioMes.getTime() - 15 * DIA);
    await db.insert(orders).values([
      { org_id: orgId, bling_order_id: `${PREFIX}${RUN}-1`, canal: 'shopee', data: inicioMes, valor_total: '100.50', itens: [] },
      { org_id: orgId, bling_order_id: `${PREFIX}${RUN}-2`, canal: 'shopee', data: inicioMes, valor_total: '200.00', itens: [] },
      { org_id: orgId, bling_order_id: `${PREFIX}${RUN}-3`, canal: 'shopee', data: mesAnterior, valor_total: '999.00', itens: [] },
    ]);

    // Outra org (isolamento multi-tenant)
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}outra-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    outraOrgId = org2!.id;
    await db.insert(reports).values({
      org_id: outraOrgId,
      status: 'done',
      periodo_inicio: base.periodo_inicio,
      periodo_fim: base.periodo_fim,
      metricas: metricasComScore(5000, 90, null),
    });
  });

  afterAll(async () => {
    await db.delete(orders).where(eq(orders.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, outraOrgId));
    await db.delete(connections).where(eq(connections.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(organizations).where(eq(organizations.id, outraOrgId));
  });

  it('listHistoricoDashboard: desc, score/totalPeriodo extraídos no SQL, sem vazar outra org', async () => {
    const { listHistoricoDashboard } = await import('@/modules/reports/report.repository');
    const rows = await listHistoricoDashboard(orgId);
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe(failedId);
    expect(rows[0].score).toBeNull(); // failed sem metricas
    expect(rows[1]).toMatchObject({ id: doneRecenteId, score: 76, totalPeriodo: 1000 });
    expect(rows[2]).toMatchObject({ score: 58, totalPeriodo: 800 });
  });

  it('getDashboardData: dedupe (latest=historico[0], latestDone/doneAnterior), SUM do mês BRT e settings', async () => {
    const { getDashboardData } = await import('@/modules/reports/dashboard-data');
    const data = await getDashboardData(orgId);

    expect(data.latest?.id).toBe(failedId); // mais recente de QUALQUER status
    expect(data.latestDone?.id).toBe(doneRecenteId); // done mais recente COM jsonb
    expect(data.latestDone?.metricas?.truth_score?.score).toBe(76);
    expect(data.doneAnterior?.metricas?.truth_score?.score).toBe(58);
    expect(data.totalMes).toBe(300.5); // SUM() no SQL, só o mês corrente BRT
    expect(data.settings).toEqual({ geracaoAutomatica: true, metaMensal: 45000 });
    expect(data.conn?.connected).toBe(true);
    expect(data.conn?.last_sync_at).not.toBeNull();
    expect(data.temProdutos).toBe(false);
    expect(data.alertas).toEqual([]);
    expect(data.titulosTasksUltimoDone).toEqual([]); // sem analiseIa no seed → sem consulta de tasks
    expect(data.historico.every((r) => [failedId, doneRecenteId].includes(r.id) || r.score === 58)).toBe(true);
  });
});
