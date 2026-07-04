import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, reports, tasks } from '@/db/schema';
import type { Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-impact-';

describe.skipIf(!url)('task-impact — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  const PERIODO = {
    inicio: new Date('2026-06-01T00:00:00Z'),
    fim: new Date('2026-06-30T23:59:59Z'),
  };

  function metricas(total: number): Metricas {
    return {
      vendasPorCanal: [
        { canal: 'shopee', total: total * 0.6, pedidos: 3 },
        { canal: 'mercado_livre', total: total * 0.4, pedidos: 2 },
      ],
      evolucao: [],
      ticketMedio: 100,
      topProdutos: [],
      posicaoPreco: [],
      benchmarkParcial: false,
    };
  }

  let orgId = '';
  let outraOrgId = '';
  let orgSemPosteriorId = '';
  let reportOrigemId = '';
  let reportAtualId = '';

  // Task concluída, com report de origem, e com relatório posterior — caminho feliz.
  let taskComImpactoId = '';
  // Task em andamento (não concluída) — impacto null mesmo com reportId.
  let taskEmAndamentoId = '';
  // Task concluída sem reportId — impacto null.
  let taskSemReportId = '';
  // Task concluída com reportId de origem, mas SEM relatório done posterior — impacto null.
  let taskSemRelatorioPosteriorId = '';
  let reportOrigemSemSucessorId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [outraOrg] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}org-iso-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    outraOrgId = outraOrg!.id;

    // Org isolada para o caso "sem relatório posterior" — precisa que o
    // report de origem seja o MAIS RECENTE done da org (nenhum outro report
    // no meio interferindo na busca de "mais recente após X").
    const [orgSemPosterior] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}org-sem-posterior-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgSemPosteriorId = orgSemPosterior!.id;

    // Report origem (done), vendasPorCanal somando 1000, created_at antigo.
    const [origem] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: PERIODO.inicio,
        periodo_fim: PERIODO.fim,
        status: 'done',
        metricas: metricas(1000),
      })
      .returning({ id: reports.id });
    reportOrigemId = origem!.id;
    await tdb
      .update(reports)
      .set({ created_at: new Date('2026-06-01T00:00:00.000Z') })
      .where(eq(reports.id, reportOrigemId));

    // Report atual (done), vendasPorCanal somando 1500, created_at posterior.
    const [atual] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: PERIODO.inicio,
        periodo_fim: PERIODO.fim,
        status: 'done',
        metricas: metricas(1500),
      })
      .returning({ id: reports.id });
    reportAtualId = atual!.id;
    await tdb
      .update(reports)
      .set({ created_at: new Date('2026-07-01T00:00:00.000Z') })
      .where(eq(reports.id, reportAtualId));

    // Report de origem SEM sucessor, em org isolada — nada é posterior a ele.
    const [origemSemSucessor] = await tdb
      .insert(reports)
      .values({
        org_id: orgSemPosteriorId,
        periodo_inicio: PERIODO.inicio,
        periodo_fim: PERIODO.fim,
        status: 'done',
        metricas: metricas(2000),
      })
      .returning({ id: reports.id });
    reportOrigemSemSucessorId = origemSemSucessor!.id;

    const [taskImpacto] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: 'Task com impacto',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
        report_id: reportOrigemId,
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskComImpactoId = taskImpacto!.id;

    const [taskAndamento] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: 'Task em andamento',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'em_andamento',
        criado_por: 'analista',
        report_id: reportOrigemId,
        ordem: 2,
      })
      .returning({ id: tasks.id });
    taskEmAndamentoId = taskAndamento!.id;

    const [taskSemReport] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: 'Task sem report_id',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
        report_id: null,
        ordem: 3,
      })
      .returning({ id: tasks.id });
    taskSemReportId = taskSemReport!.id;

    const [taskSemPosterior] = await tdb
      .insert(tasks)
      .values({
        org_id: orgSemPosteriorId,
        titulo: 'Task sem relatório posterior',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
        report_id: reportOrigemSemSucessorId,
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskSemRelatorioPosteriorId = taskSemPosterior!.id;
  });

  afterAll(async () => {
    const orgIds = [orgId, outraOrgId, orgSemPosteriorId].filter(Boolean);
    if (orgIds.length) {
      await tdb.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await tdb.delete(reports).where(inArray(reports.org_id, orgIds));
      await tdb.delete(organizations).where(inArray(organizations.id, orgIds));
    }
    await sql.end();
  });

  it('getTaskImpact retorna totalOrigem/totalAtual/deltaPct para task concluída com relatório posterior', async () => {
    const { getTaskImpact } = await import('@/modules/tasks/task-impact');
    const impact = await getTaskImpact(taskComImpactoId, orgId);

    expect(impact).not.toBeNull();
    expect(impact!.totalOrigem).toBe(1000);
    expect(impact!.totalAtual).toBe(1500);
    expect(impact!.deltaPct).toBe(50);
  });

  it('task em_andamento retorna null (precisa estar concluída)', async () => {
    const { getTaskImpact } = await import('@/modules/tasks/task-impact');
    const impact = await getTaskImpact(taskEmAndamentoId, orgId);
    expect(impact).toBeNull();
  });

  it('task concluída sem report_id retorna null', async () => {
    const { getTaskImpact } = await import('@/modules/tasks/task-impact');
    const impact = await getTaskImpact(taskSemReportId, orgId);
    expect(impact).toBeNull();
  });

  it('task concluída sem relatório done posterior ao de origem retorna null', async () => {
    const { getTaskImpact } = await import('@/modules/tasks/task-impact');
    const impact = await getTaskImpact(taskSemRelatorioPosteriorId, orgSemPosteriorId);
    expect(impact).toBeNull();
  });

  it('escopo: getTaskImpact com orgId de outra org retorna null', async () => {
    const { getTaskImpact } = await import('@/modules/tasks/task-impact');
    const impact = await getTaskImpact(taskComImpactoId, outraOrgId);
    expect(impact).toBeNull();
  });
});
