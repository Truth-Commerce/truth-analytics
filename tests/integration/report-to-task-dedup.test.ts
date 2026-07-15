import { and, eq, inArray, ne } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, tasks, users } from '@/db/schema';
import { createTasksFromReport } from '@/modules/tasks/report-to-task.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-r2t-dedup-';

// Dois relatórios da MESMA org, ambos done, com o MESMO achado em `gargalos`.
const SAMPLE_ANALISE = {
  resumoExecutivo: 'R.',
  gargalos: ['Custo de frete elevado no canal ML'],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe.skipIf(!url)('report-to-task.repository — dedup cross-report + reincidência (integração)', () => {
  let orgId = '';
  let repAId = '';
  let repBId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [repA] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-05-01'),
        periodo_fim: new Date('2026-05-31'),
        analise_ia: SAMPLE_ANALISE,
      })
      .returning({ id: reports.id });
    repAId = repA!.id;

    const [repB] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        analise_ia: SAMPLE_ANALISE,
      })
      .returning({ id: reports.id });
    repBId = repB!.id;
  });

  afterAll(async () => {
    if (!orgId) return;
    const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    const taskIds = taskRows.map((r) => r.id);
    if (taskIds.length) {
      await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
    }
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('dedup cross-report: task ABERTA criada pelo repA bloqueia o mesmo achado no repB', async () => {
    const a = await createTasksFromReport({ reportId: repAId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(a).toBe(1);
    const b = await createTasksFromReport({ reportId: repBId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(b).toBe(0);
  });

  it('dedup é por título NORMALIZADO (caixa/acento diferentes ainda bloqueiam)', async () => {
    // torna a task existente CAIXA ALTA — normalizarTexto ainda bate
    await db.update(tasks).set({ titulo: 'CUSTO DE FRETE ELEVADO NO CANAL ML' }).where(eq(tasks.org_id, orgId));
    const b = await createTasksFromReport({ reportId: repBId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(b).toBe(0);
  });

  it('reincidência: achado igual a task CONCLUÍDA cria de novo com nota + activity', async () => {
    await db.update(tasks).set({ status: 'concluida' }).where(eq(tasks.org_id, orgId));
    const b = await createTasksFromReport({ reportId: repBId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(b).toBe(1);
    const novas = await db.select().from(tasks).where(and(eq(tasks.org_id, orgId), ne(tasks.status, 'concluida')));
    expect(novas).toHaveLength(1);
    expect(novas[0]!.descricao).toContain('_Reincidente: recomendação já concluída anteriormente');
    expect(novas[0]!.descricao).toContain('/dashboard/plano-de-acao/');
    const acts = await db
      .select()
      .from(taskActivities)
      .where(and(eq(taskActivities.task_id, novas[0]!.id), eq(taskActivities.evento, 'reincidencia')));
    expect(acts).toHaveLength(1);
    expect(acts[0]!.de).not.toBeNull(); // id da task anterior
  });
});
