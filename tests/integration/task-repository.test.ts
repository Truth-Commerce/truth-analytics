import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, reports, taskActivities, taskComments, tasks, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-task-';

describe.skipIf(!url)('task.repository — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  let orgAId = '';
  let orgBId = '';
  let orgCId = '';
  let userAId = '';
  let userBId = '';
  let userCId = '';

  // estado construído sequencialmente pelos testes de A (ordem/moveTask)
  let taskA1Id = '';
  let taskA2Id = '';
  let taskA3Id = '';
  let taskA4Id = '';

  beforeAll(async () => {
    const [orgA] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}A-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;

    const [orgB] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}B-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;

    const [orgC] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}C-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgCId = orgC!.id;

    const [userA] = await tdb
      .insert(users)
      .values({ org_id: orgAId, email: `${PREFIX}a-${RUN}@example.com`, senha_hash: 'hash', role: 'analista' })
      .returning({ id: users.id });
    userAId = userA!.id;

    const [userB] = await tdb
      .insert(users)
      .values({ org_id: orgBId, email: `${PREFIX}b-${RUN}@example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userBId = userB!.id;

    const [userC] = await tdb
      .insert(users)
      .values({ org_id: orgCId, email: `${PREFIX}c-${RUN}@example.com`, senha_hash: 'hash', role: 'analista' })
      .returning({ id: users.id });
    userCId = userC!.id;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId, orgCId].filter(Boolean);
    if (orgIds.length) {
      const taskRows = await tdb.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, orgIds));
      const taskIds = taskRows.map((r) => r.id);
      if (taskIds.length) {
        await tdb.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
        await tdb.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
      }
      await tdb.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await tdb.delete(reports).where(inArray(reports.org_id, orgIds));
      await tdb.delete(users).where(inArray(users.org_id, orgIds));
      await tdb.delete(organizations).where(inArray(organizations.id, orgIds));
    }
    await sql.end();
  });

  it('createTask em A cria a task e respeita o escopo por org (B não a enxerga)', async () => {
    const { createTask, listTasksByOrg, getTaskById } = await import('@/modules/tasks/task.repository');

    taskA1Id = await createTask({
      orgId: orgAId,
      titulo: 'Tarefa A1',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userAId,
    });

    const listA = await listTasksByOrg(orgAId);
    expect(listA).toHaveLength(1);
    expect(listA[0]!.titulo).toBe('Tarefa A1');
    expect(listA[0]!.status).toBe('backlog');
    expect(listA[0]!.ordem).toBe(1);

    const listB = await listTasksByOrg(orgBId);
    expect(listB).toHaveLength(0);

    expect(await getTaskById(taskA1Id, orgBId)).toBeNull();

    const detailA = await getTaskById(taskA1Id, orgAId);
    expect(detailA?.titulo).toBe('Tarefa A1');
    expect(detailA?.orgId).toBe(orgAId);
  });

  it('ordem incremental: 2ª task em backlog recebe ordem 2', async () => {
    const { createTask, getTaskById } = await import('@/modules/tasks/task.repository');

    taskA2Id = await createTask({
      orgId: orgAId,
      titulo: 'Tarefa A2',
      tipo: 'preco',
      prioridade: 'baixa',
      criadoPor: 'cliente',
      actorUserId: userAId,
    });

    const a1 = await getTaskById(taskA1Id, orgAId);
    const a2 = await getTaskById(taskA2Id, orgAId);
    expect(a1?.ordem).toBe(1);
    expect(a2?.ordem).toBe(2);
  });

  it('reorderTask up troca ordem com o vizinho; up no primeiro é no-op', async () => {
    const { reorderTask, getTaskById } = await import('@/modules/tasks/task.repository');

    await reorderTask({ taskId: taskA2Id, orgId: orgAId, direcao: 'up' });
    const a1depois = await getTaskById(taskA1Id, orgAId);
    const a2depois = await getTaskById(taskA2Id, orgAId);
    expect(a2depois?.ordem).toBe(1);
    expect(a1depois?.ordem).toBe(2);

    // a2 agora é o primeiro (ordem 1) — subir de novo é no-op
    await reorderTask({ taskId: taskA2Id, orgId: orgAId, direcao: 'up' });
    const a2final = await getTaskById(taskA2Id, orgAId);
    expect(a2final?.ordem).toBe(1);
  });

  it('moveTask cliente backlog→todo é permitido e grava activity de status', async () => {
    const { moveTask } = await import('@/modules/tasks/task.repository');
    const { listTaskActivities } = await import('@/modules/tasks/task-activity.repository');

    const novoStatus = await moveTask({
      taskId: taskA1Id,
      orgId: orgAId,
      ator: 'cliente',
      actorUserId: userAId,
      para: 'todo',
    });
    expect(novoStatus).toBe('todo');

    const activities = await listTaskActivities(taskA1Id, orgAId);
    const statusActivity = activities.find((a) => a.evento === 'status');
    expect(statusActivity).toBeDefined();
    expect(statusActivity?.de).toBe('backlog');
    expect(statusActivity?.para).toBe('todo');
  });

  it('moveTask cliente em_andamento→concluida com criadoPor ia rejeita transicao_invalida', async () => {
    const { createTask, moveTask } = await import('@/modules/tasks/task.repository');

    taskA3Id = await createTask({
      orgId: orgAId,
      titulo: 'Tarefa A3 (ia)',
      tipo: 'anuncio',
      prioridade: 'alta',
      criadoPor: 'ia',
      actorUserId: null,
    });

    // analista pode mover livremente — avança até em_andamento
    await moveTask({ taskId: taskA3Id, orgId: orgAId, ator: 'analista', actorUserId: userAId, para: 'todo' });
    await moveTask({
      taskId: taskA3Id,
      orgId: orgAId,
      ator: 'analista',
      actorUserId: userAId,
      para: 'em_andamento',
    });

    await expect(
      moveTask({
        taskId: taskA3Id,
        orgId: orgAId,
        ator: 'cliente',
        actorUserId: userAId,
        para: 'concluida',
      }),
    ).rejects.toThrow('transicao_invalida');
  });

  it('moveTask analista em_revisao→concluida é permitido', async () => {
    const { createTask, moveTask } = await import('@/modules/tasks/task.repository');

    taskA4Id = await createTask({
      orgId: orgAId,
      titulo: 'Tarefa A4',
      tipo: 'logistica',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userAId,
    });

    await moveTask({
      taskId: taskA4Id,
      orgId: orgAId,
      ator: 'analista',
      actorUserId: userAId,
      para: 'em_revisao',
    });

    const novoStatus = await moveTask({
      taskId: taskA4Id,
      orgId: orgAId,
      ator: 'analista',
      actorUserId: userAId,
      para: 'concluida',
    });
    expect(novoStatus).toBe('concluida');
  });

  it('moveTask com orgId de B sobre task de A lança task_nao_encontrada', async () => {
    const { moveTask } = await import('@/modules/tasks/task.repository');

    await expect(
      moveTask({
        taskId: taskA1Id,
        orgId: orgBId,
        ator: 'analista',
        actorUserId: userBId,
        para: 'em_andamento',
      }),
    ).rejects.toThrow('task_nao_encontrada');
  });

  it('updateTask edita campos, grava activity editada e activities extras de prazo/assignee', async () => {
    const { createTask, updateTask, getTaskById } = await import('@/modules/tasks/task.repository');
    const { listTaskActivities } = await import('@/modules/tasks/task-activity.repository');

    const taskId = await createTask({
      orgId: orgCId,
      titulo: 'Tarefa C1',
      tipo: 'conta',
      prioridade: 'media',
      criadoPor: 'analista',
      prazo: '2026-08-01',
      actorUserId: userCId,
    });

    await updateTask({
      taskId,
      orgId: orgCId,
      actorUserId: userCId,
      patch: {
        titulo: 'Tarefa C1 (editada)',
        prazo: '2026-09-15',
        assigneeUserId: userCId,
      },
    });

    const detail = await getTaskById(taskId, orgCId);
    expect(detail?.titulo).toBe('Tarefa C1 (editada)');
    expect(detail?.prazo).toBe('2026-09-15');
    expect(detail?.assigneeUserId).toBe(userCId);

    const activities = await listTaskActivities(taskId, orgCId);
    expect(activities.some((a) => a.evento === 'editada')).toBe(true);
    const prazoActivity = activities.find((a) => a.evento === 'prazo');
    expect(prazoActivity?.de).toBe('2026-08-01');
    expect(prazoActivity?.para).toBe('2026-09-15');
    const assigneeActivity = activities.find((a) => a.evento === 'assignee');
    expect(assigneeActivity?.de).toBeNull();
    expect(assigneeActivity?.para).toBe(userCId);

    // update sem mudar prazo/assignee não deve gerar activities extras de novo
    await updateTask({
      taskId,
      orgId: orgCId,
      actorUserId: userCId,
      patch: { descricao: 'nova descrição' },
    });
    const activitiesDepois = await listTaskActivities(taskId, orgCId);
    expect(activitiesDepois.filter((a) => a.evento === 'prazo')).toHaveLength(1);
    expect(activitiesDepois.filter((a) => a.evento === 'assignee')).toHaveLength(1);
    expect(activitiesDepois.filter((a) => a.evento === 'editada')).toHaveLength(2);
  });

  it('deleteTask remove comments/activities/task; escopo errado lança task_nao_encontrada', async () => {
    const { createTask, deleteTask, getTaskById } = await import('@/modules/tasks/task.repository');

    const taskId = await createTask({
      orgId: orgCId,
      titulo: 'Tarefa C2 (a apagar)',
      tipo: 'outro',
      prioridade: 'baixa',
      criadoPor: 'analista',
      actorUserId: userCId,
    });

    await expect(deleteTask(taskId, orgAId)).rejects.toThrow('task_nao_encontrada');

    await deleteTask(taskId, orgCId);
    expect(await getTaskById(taskId, orgCId)).toBeNull();

    const [activityRow] = await tdb
      .select({ id: taskActivities.id })
      .from(taskActivities)
      .where(inArray(taskActivities.task_id, [taskId]));
    expect(activityRow).toBeUndefined();
  });

  it('countTasksAbertas e listTaskTitulosByReport respeitam escopo e filtros', async () => {
    const { createTask, moveTask, countTasksAbertas, listTaskTitulosByReport } = await import(
      '@/modules/tasks/task.repository'
    );

    const [report] = await tdb
      .insert(reports)
      .values({
        org_id: orgCId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
      })
      .returning({ id: reports.id });
    const reportId = report!.id;

    const openTaskId = await createTask({
      orgId: orgCId,
      titulo: 'Tarefa do relatório (aberta)',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'ia',
      reportId,
      actorUserId: null,
    });
    const outroOpenTaskId = await createTask({
      orgId: orgCId,
      titulo: 'Tarefa aberta sem relatório',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userCId,
    });
    const closedTaskId = await createTask({
      orgId: orgCId,
      titulo: 'Tarefa do relatório (concluída)',
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'ia',
      reportId,
      actorUserId: null,
    });
    await moveTask({ taskId: closedTaskId, orgId: orgCId, ator: 'analista', actorUserId: userCId, para: 'em_revisao' });
    await moveTask({ taskId: closedTaskId, orgId: orgCId, ator: 'analista', actorUserId: userCId, para: 'concluida' });

    // 3 abertas em orgC: "Tarefa C1 (editada)" (deixada em backlog pelo teste de updateTask)
    // + openTaskId + outroOpenTaskId. closedTaskId (concluída) não conta.
    expect(await countTasksAbertas(orgCId)).toBe(3);
    // org sem nenhuma task aberta
    expect(await countTasksAbertas(orgBId)).toBe(0);

    const titulos = await listTaskTitulosByReport(reportId, orgCId);
    expect(titulos.sort()).toEqual(['Tarefa do relatório (aberta)', 'Tarefa do relatório (concluída)'].sort());
    expect(titulos).not.toContain('Tarefa aberta sem relatório');

    // escopo: org errada não vê os títulos do relatório
    expect(await listTaskTitulosByReport(reportId, orgAId)).toEqual([]);

    void openTaskId;
    void outroOpenTaskId;
  });
});
