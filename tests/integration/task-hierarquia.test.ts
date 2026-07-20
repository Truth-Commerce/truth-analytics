import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, tasks, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-hierarquia-';

describe.skipIf(!url)('task.repository — hierarquia (épico > task > subtask)', () => {
  let orgAId = '';
  let orgBId = '';
  let userAId = '';
  let reportId = '';

  let epicoId = '';
  let taskFilhaId = '';
  let task2Id = '';
  let subtaskId = '';

  beforeAll(async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}A-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;

    const [orgB] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}B-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;

    const [userA] = await db
      .insert(users)
      .values({ org_id: orgAId, email: `${PREFIX}a-${RUN}@example.com`, senha_hash: 'hash', role: 'analista' })
      .returning({ id: users.id });
    userAId = userA!.id;

    const [report] = await db
      .insert(reports)
      .values({ org_id: orgAId, periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-06-30') })
      .returning({ id: reports.id });
    reportId = report!.id;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId].filter(Boolean);
    if (orgIds.length) {
      const taskRows = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, orgIds));
      const taskIds = taskRows.map((r) => r.id);
      if (taskIds.length) await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
      await db.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await db.delete(reports).where(inArray(reports.org_id, orgIds));
      await db.delete(users).where(inArray(users.org_id, orgIds));
      await db.delete(organizations).where(inArray(organizations.id, orgIds));
    }
  });

  it('criarEpico cria task nivel=epico, sem parent, com o reportId informado', async () => {
    const { criarEpico } = await import('@/modules/tasks/task.repository');

    epicoId = await criarEpico({
      orgId: orgAId,
      titulo: 'Épico 1',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'analista',
      reportId,
      actorUserId: userAId,
    });

    const [row] = await db.select().from(tasks).where(eq(tasks.id, epicoId));
    expect(row?.nivel).toBe('epico');
    expect(row?.parent_id).toBeNull();
    expect(row?.report_id).toBe(reportId);
    expect(row?.org_id).toBe(orgAId);
  });

  it('criarSubtarefa cria task filha (nivel=task) do épico, herdando org_id E report_id do pai', async () => {
    const { criarSubtarefa } = await import('@/modules/tasks/task.repository');

    // reportId NÃO é passado — deve vir por herança do épico.
    taskFilhaId = await criarSubtarefa({
      orgId: orgAId,
      parentId: epicoId,
      nivel: 'task',
      titulo: 'Task filha do épico',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userAId,
    });

    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskFilhaId));
    expect(row?.nivel).toBe('task');
    expect(row?.parent_id).toBe(epicoId);
    expect(row?.org_id).toBe(orgAId);
    expect(row?.report_id).toBe(reportId);
  });

  it('criarSubtarefa cria subtask filha da task, herdando org_id E report_id do pai (que herdou do épico)', async () => {
    const { criarSubtarefa } = await import('@/modules/tasks/task.repository');

    subtaskId = await criarSubtarefa({
      orgId: orgAId,
      parentId: taskFilhaId,
      nivel: 'subtask',
      titulo: 'Subtask 1',
      tipo: 'catalogo',
      prioridade: 'baixa',
      criadoPor: 'analista',
      actorUserId: userAId,
    });

    const [row] = await db.select().from(tasks).where(eq(tasks.id, subtaskId));
    expect(row?.nivel).toBe('subtask');
    expect(row?.parent_id).toBe(taskFilhaId);
    expect(row?.org_id).toBe(orgAId);
    expect(row?.report_id).toBe(reportId);
  });

  it('nível inválido é rejeitado: epico como filho de task, e subtask direto como filho de épico', async () => {
    const { criarSubtarefa } = await import('@/modules/tasks/task.repository');

    await expect(
      criarSubtarefa({
        orgId: orgAId,
        parentId: taskFilhaId,
        nivel: 'epico',
        titulo: 'Inválido: épico filho de task',
        tipo: 'catalogo',
        prioridade: 'media',
        criadoPor: 'analista',
        actorUserId: userAId,
      }),
    ).rejects.toThrow();

    await expect(
      criarSubtarefa({
        orgId: orgAId,
        parentId: epicoId,
        nivel: 'subtask',
        titulo: 'Inválido: subtask direto de épico',
        tipo: 'catalogo',
        prioridade: 'media',
        criadoPor: 'analista',
        actorUserId: userAId,
      }),
    ).rejects.toThrow();
  });

  it('criarSubtarefa com parentId de outra org rejeita (pai não encontrado no escopo)', async () => {
    const { criarSubtarefa } = await import('@/modules/tasks/task.repository');

    await expect(
      criarSubtarefa({
        orgId: orgBId,
        parentId: epicoId,
        nivel: 'task',
        titulo: 'Cross-org inválido',
        tipo: 'catalogo',
        prioridade: 'media',
        criadoPor: 'analista',
        actorUserId: null,
      }),
    ).rejects.toThrow();
  });

  it('progressoDeEpicos agrega apenas as filhas diretas (tasks) do épico, não conta subtasks', async () => {
    const { criarSubtarefa, progressoDeEpicos } = await import('@/modules/tasks/task.repository');
    const { moveTask } = await import('@/modules/tasks/task.repository');

    task2Id = await criarSubtarefa({
      orgId: orgAId,
      parentId: epicoId,
      nivel: 'task',
      titulo: 'Task 2 do épico (será concluída)',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userAId,
    });
    await moveTask({ taskId: task2Id, orgId: orgAId, ator: 'analista', actorUserId: userAId, para: 'todo' });
    await moveTask({ taskId: task2Id, orgId: orgAId, ator: 'analista', actorUserId: userAId, para: 'em_andamento' });
    await moveTask({ taskId: task2Id, orgId: orgAId, ator: 'analista', actorUserId: userAId, para: 'em_revisao' });
    await moveTask({ taskId: task2Id, orgId: orgAId, ator: 'analista', actorUserId: userAId, para: 'concluida' });

    const mapa = await progressoDeEpicos(orgAId, [epicoId]);
    const progresso = mapa.get(epicoId);
    // filhas diretas: taskFilhaId (backlog) + task2Id (concluida) = 2 total, 1 concluída.
    // subtaskId (filha de taskFilhaId, não do épico) NÃO deve entrar nessa conta.
    expect(progresso).toEqual({ total: 2, concluidas: 1, pct: 50 });
  });

  it('progressoDeEpicos com épico sem filhas devolve total=0/pct=0; épico inexistente também entra no mapa', async () => {
    const { criarEpico, progressoDeEpicos } = await import('@/modules/tasks/task.repository');

    const epicoVazioId = await criarEpico({
      orgId: orgAId,
      titulo: 'Épico sem filhas',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userAId,
    });

    const mapa = await progressoDeEpicos(orgAId, [epicoId, epicoVazioId]);
    expect(mapa.get(epicoVazioId)).toEqual({ total: 0, concluidas: 0, pct: 0 });
    expect(mapa.get(epicoId)?.total).toBe(2);
  });

  it('listarArvore devolve épico + tasks filhas + subtasks aninhadas; org errada não enxerga (null)', async () => {
    const { listarArvore } = await import('@/modules/tasks/task.repository');

    const arvore = await listarArvore(orgAId, epicoId);
    expect(arvore).not.toBeNull();
    expect(arvore?.epico.id).toBe(epicoId);
    expect(arvore?.tasks.map((t) => t.id).sort()).toEqual([taskFilhaId, task2Id].sort());

    const taskFilhaNode = arvore?.tasks.find((t) => t.id === taskFilhaId);
    expect(taskFilhaNode?.subtasks.map((s) => s.id)).toEqual([subtaskId]);

    const task2Node = arvore?.tasks.find((t) => t.id === task2Id);
    expect(task2Node?.subtasks).toEqual([]);

    // org B não enxerga o épico de A — escopo respeitado.
    expect(await listarArvore(orgBId, epicoId)).toBeNull();
  });

  it('getPaiEFilhas: épico tem pai null e filhas=tasks; task tem pai=épico e filhas=subtasks; subtask não tem filhas', async () => {
    const { getPaiEFilhas } = await import('@/modules/tasks/task.repository');

    const epicoPaiFilhas = await getPaiEFilhas(epicoId, orgAId);
    expect(epicoPaiFilhas?.pai).toBeNull();
    expect(epicoPaiFilhas?.filhas.map((f) => f.id).sort()).toEqual([taskFilhaId, task2Id].sort());

    const taskPaiFilhas = await getPaiEFilhas(taskFilhaId, orgAId);
    expect(taskPaiFilhas?.pai?.id).toBe(epicoId);
    expect(taskPaiFilhas?.filhas.map((f) => f.id)).toEqual([subtaskId]);

    const subtaskPaiFilhas = await getPaiEFilhas(subtaskId, orgAId);
    expect(subtaskPaiFilhas?.pai?.id).toBe(taskFilhaId);
    expect(subtaskPaiFilhas?.filhas).toEqual([]);

    // escopo errado: org B não enxerga a task de A.
    expect(await getPaiEFilhas(epicoId, orgBId)).toBeNull();
  });

  it('createTask (retrocompat): sem parentId/nivel continua criando nivel=task, parent_id=null', async () => {
    const { createTask } = await import('@/modules/tasks/task.repository');

    const taskId = await createTask({
      orgId: orgAId,
      titulo: 'Task legada (sem hierarquia)',
      tipo: 'outro',
      prioridade: 'baixa',
      criadoPor: 'analista',
      actorUserId: userAId,
    });

    const [row] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgAId)));
    expect(row?.nivel).toBe('task');
    expect(row?.parent_id).toBeNull();
  });
});
