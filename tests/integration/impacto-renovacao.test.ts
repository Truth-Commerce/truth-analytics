import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, tasks, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';
import type { Metricas, TruthScore } from '@/modules/pipeline/contracts';

const RUN = Date.now();
const PREFIX = 'ta-test-impacto-';

const PERIODO = {
  inicio: new Date('2026-06-01T00:00:00Z'),
  fim: new Date('2026-06-30T23:59:59Z'),
};

// Datas explícitas (não defaultNow) para a ordem 1º→último e o "intervalo entre
// os dois dones" serem determinísticos — mesmo padrão de task-impact.test.ts.
const REP1_CREATED = new Date('2026-06-01T00:00:00.000Z');
const ENTRE_REPS = new Date('2026-06-15T00:00:00.000Z');
const REP2_CREATED = new Date('2026-07-01T00:00:00.000Z');

function truthScore(score: number, totalPeriodo: number): TruthScore {
  return {
    score,
    totalPeriodo,
    totalPeriodoAnterior: null,
    fatores: {
      crescimento: { pontos: 10, max: 30, variacaoPercentual: null },
      posicaoPreco: { pontos: 10, max: 20, itensAvaliados: 0 },
      diversificacao: { pontos: 10, max: 20, canaisComVenda: 1 },
      regularidade: { pontos: 10, max: 15, diasComVenda: 10, diasPeriodo: 30 },
      cobertura: { pontos: 8, max: 15, produtosComBenchmark: 0, produtosAvaliados: 0 },
    },
  };
}

function metricas(total: number, score: number): Metricas {
  return {
    vendasPorCanal: [{ canal: 'x', total, pedidos: 1 }],
    evolucao: [],
    ticketMedio: 0,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    truth_score: truthScore(score, total),
  };
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('impacto para renovação — integração', () => {
  let orgId = '';
  let orgUmDoneId = '';
  let orgCutoverId = '';
  let orgOlistPairId = '';
  let analistaId = '';
  let rep1Id = '';
  let rep2Id = '';
  let taskSemReportId = '';
  const taskIds: string[] = [];

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');

    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [orgCutover, orgOlistPair] = await db
      .insert(organizations)
      .values([
        { name: `${PREFIX}cutover-${RUN}`, status: 'active' },
        { name: `${PREFIX}olist-pair-${RUN}`, status: 'active' },
      ])
      .returning({ id: organizations.id });
    orgCutoverId = orgCutover!.id;
    orgOlistPairId = orgOlistPair!.id;

    // Org com UM done só — sem comparação possível (primeiro === ultimo).
    const [orgUmDone] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-1done-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgUmDoneId = orgUmDone!.id;

    const [an] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}an-${RUN}@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = an!.id;

    // Carteira do analista = as duas orgs (analista_id direto, sem audit).
    await db
      .update(organizations)
      .set({ analista_id: analistaId })
      .where(inArray(organizations.id, [orgId, orgUmDoneId, orgCutoverId, orgOlistPairId]));

    const baseReport = { periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim, status: 'done' as const };

    const [rep1] = await db
      .insert(reports)
      .values({ ...baseReport, org_id: orgId, metricas: metricas(9700, 58), created_at: REP1_CREATED })
      .returning({ id: reports.id });
    rep1Id = rep1!.id;

    // Task concluída SEM report_id, criada ENTRE os dois dones — baseline do
    // getTaskImpact deve ser o rep1 (done mais próximo da criação).
    const [taskSemReport] = await db
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${PREFIX}task-sem-report`,
        tipo: 'outro',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
        report_id: null,
        created_at: ENTRE_REPS,
      })
      .returning({ id: tasks.id });
    taskSemReportId = taskSemReport!.id;
    taskIds.push(taskSemReportId);

    // Conclusão registrada ENTRE rep1 e rep2 → conta em tasksConcluidas.
    await db.insert(taskActivities).values({
      task_id: taskSemReportId,
      evento: 'status',
      de: 'em_revisao',
      para: 'concluida',
      created_at: ENTRE_REPS,
    });

    const [rep2] = await db
      .insert(reports)
      .values({ ...baseReport, org_id: orgId, metricas: metricas(10880, 76), created_at: REP2_CREATED })
      .returning({ id: reports.id });
    rep2Id = rep2!.id;

    // Único done da org "1 done".
    await db
      .insert(reports)
      .values({ ...baseReport, org_id: orgUmDoneId, metricas: metricas(500, 40), created_at: REP1_CREATED });

    await db.insert(reports).values([
      { ...baseReport, org_id: orgCutoverId, metricas: metricas(100, 10), created_at: REP1_CREATED },
      { ...baseReport, org_id: orgCutoverId, metricas: metricas(500, 50), source_provider: 'olist', source_generation: 3, created_at: REP2_CREATED },
      { ...baseReport, org_id: orgOlistPairId, metricas: metricas(100, 10), created_at: REP1_CREATED },
      { ...baseReport, org_id: orgOlistPairId, metricas: metricas(400, 40), source_provider: 'olist', source_generation: 3, created_at: REP2_CREATED },
      { ...baseReport, org_id: orgOlistPairId, metricas: metricas(600, 60), source_provider: 'olist', source_generation: 3, created_at: new Date('2026-08-01T00:00:00.000Z') },
    ]);
  });

  afterAll(async () => {
    const orgIds = [orgId, orgUmDoneId, orgCutoverId, orgOlistPairId].filter(Boolean);
    if (taskIds.length) {
      await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
      await db.delete(tasks).where(inArray(tasks.id, taskIds));
    }
    if (orgIds.length) {
      await db.delete(reports).where(inArray(reports.org_id, orgIds));
      // organizations.analista_id → users.id (sem ON DELETE): limpar antes do delete de users.
      await db.update(organizations).set({ analista_id: null }).where(inArray(organizations.id, orgIds));
    }
    if (analistaId) await db.delete(users).where(inArray(users.id, [analistaId]));
    if (orgIds.length) await db.delete(organizations).where(inArray(organizations.id, orgIds));
  });

  it('getPrimeiroDoneReport / getDoneMaisProximo', async () => {
    const { getDoneMaisProximo, getPrimeiroDoneReport } = await import('@/modules/reports/report.repository');
    const primeiro = await getPrimeiroDoneReport(orgId);
    expect(primeiro?.id).toBe(rep1Id);
    const proximo = await getDoneMaisProximo(orgId, new Date()); // agora → o mais recente <= agora
    expect(proximo?.id).toBe(rep2Id);
    const antesDoPrimeiro = await getDoneMaisProximo(orgId, new Date('2025-01-01T00:00:00Z'));
    expect(antesDoPrimeiro?.id).toBe(rep1Id); // fallback: mais antigo depois da ref
  });

  it('getPrimeiroDoneReport / getDoneMaisProximo não vazam para outra org', async () => {
    const { getDoneMaisProximo, getPrimeiroDoneReport } = await import('@/modules/reports/report.repository');
    const primeiro = await getPrimeiroDoneReport(orgUmDoneId);
    expect(primeiro?.id).not.toBe(rep1Id);
    const proximo = await getDoneMaisProximo(orgUmDoneId, new Date());
    expect(proximo?.id).not.toBe(rep2Id);
  });

  it('getImpactoPorOrg agrega primeiro vs último + tasks concluídas no intervalo', async () => {
    const { getImpactoPorOrg } = await import('@/modules/analista/analista.repository');
    const lista = await getImpactoPorOrg({ id: analistaId, orgId, role: 'analista' } as UserAccess);
    const org = lista.find((o) => o.orgId === orgId)!;
    expect(org).toBeDefined();
    expect(org.primeiro?.total).toBe(9700);
    expect(org.primeiro?.score).toBe(58);
    expect(org.ultimo?.total).toBe(10880);
    expect(org.ultimo?.score).toBe(76);
    expect(org.deltaFaturamentoPct).toBe(12.2);
    expect(org.deltaScore).toBe(18);
    expect(org.tasksConcluidas).toBe(1);
  });

  it('getImpactoPorOrg com um done só → sem comparação (pontas null)', async () => {
    const { getImpactoPorOrg } = await import('@/modules/analista/analista.repository');
    const lista = await getImpactoPorOrg({ id: analistaId, orgId, role: 'analista' } as UserAccess);
    const org = lista.find((o) => o.orgId === orgUmDoneId)!;
    expect(org).toBeDefined();
    expect(org.primeiro).toBeNull();
    expect(org.ultimo).toBeNull();
    expect(org.deltaFaturamentoPct).toBeNull();
    expect(org.deltaScore).toBeNull();
    expect(org.tasksConcluidas).toBe(0);
  });

  it('não compara o último Olist com o histórico Bling de antes do cutover', async () => {
    const { getImpactoPorOrg } = await import('@/modules/analista/analista.repository');
    const lista = await getImpactoPorOrg({ id: analistaId, orgId, role: 'analista' } as UserAccess);
    const org = lista.find((o) => o.orgId === orgCutoverId)!;
    expect(org.primeiro).toBeNull();
    expect(org.ultimo).toBeNull();
    expect(org.deltaFaturamentoPct).toBeNull();
  });

  it('ancora impacto Olist no primeiro done da mesma geração', async () => {
    const { getImpactoPorOrg } = await import('@/modules/analista/analista.repository');
    const lista = await getImpactoPorOrg({ id: analistaId, orgId, role: 'analista' } as UserAccess);
    const org = lista.find((o) => o.orgId === orgOlistPairId)!;
    expect(org.primeiro?.total).toBe(400);
    expect(org.ultimo?.total).toBe(600);
    expect(org.deltaFaturamentoPct).toBe(50);
  });

  it('getTaskImpact para task SEM report_id usa o done mais próximo da criação como baseline', async () => {
    const { getTaskImpact } = await import('@/modules/tasks/task-impact');
    // task criada entre rep1 e rep2 → origem rep1, atual rep2
    const impact = await getTaskImpact(taskSemReportId, orgId);
    expect(impact).not.toBeNull();
    expect(impact!.totalOrigem).toBe(9700);
    expect(impact!.totalAtual).toBe(10880);
  });
});
