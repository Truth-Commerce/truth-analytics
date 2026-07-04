import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, taskActivities, taskComments, tasks, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-comment-';

describe.skipIf(!url)('task-comment.repository — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  let orgAId = '';
  let orgBId = '';
  let userAId = '';
  let userBId = '';
  let taskAId = '';

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

    const [taskA] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId,
        titulo: 'Tarefa A (comentários)',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'backlog',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskAId = taskA!.id;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId].filter(Boolean);
    if (orgIds.length) {
      const taskRows = await tdb.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, orgIds));
      const taskIds = taskRows.map((r) => r.id);
      if (taskIds.length) {
        await tdb.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
        await tdb.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
      }
      await tdb.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await tdb.delete(users).where(inArray(users.org_id, orgIds));
      await tdb.delete(organizations).where(inArray(organizations.id, orgIds));
    }
    await sql.end();
  });

  it('addTaskComment insere o comentário e aparece em listTaskComments com userEmail', async () => {
    const { addTaskComment, listTaskComments } = await import('@/modules/tasks/task-comment.repository');

    const commentId = await addTaskComment({
      taskId: taskAId,
      orgId: orgAId,
      userId: userAId,
      corpo: 'Primeiro comentário',
    });
    expect(commentId).toBeTruthy();

    const lista = await listTaskComments(taskAId, orgAId);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.id).toBe(commentId);
    expect(lista[0]!.corpo).toBe('Primeiro comentário');
    expect(lista[0]!.userId).toBe(userAId);
    expect(lista[0]!.userEmail).toBe(`${PREFIX}a-${RUN}@example.com`);
    expect(lista[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('listTaskComments com orgId de B sobre task de A retorna lista vazia (escopo)', async () => {
    const { listTaskComments } = await import('@/modules/tasks/task-comment.repository');

    const lista = await listTaskComments(taskAId, orgBId);
    expect(lista).toEqual([]);
  });

  it('addTaskComment com orgId de B sobre task de A rejeita task_nao_encontrada', async () => {
    const { addTaskComment } = await import('@/modules/tasks/task-comment.repository');

    await expect(
      addTaskComment({
        taskId: taskAId,
        orgId: orgBId,
        userId: userBId,
        corpo: 'Comentário indevido',
      }),
    ).rejects.toThrow('task_nao_encontrada');
  });

  it('addTaskComment grava activity "comentario" e listTaskComments ordena asc por created_at', async () => {
    const { addTaskComment, listTaskComments } = await import('@/modules/tasks/task-comment.repository');
    const { listTaskActivities } = await import('@/modules/tasks/task-activity.repository');

    const segundoId = await addTaskComment({
      taskId: taskAId,
      orgId: orgAId,
      userId: userAId,
      corpo: 'Segundo comentário',
    });

    const lista = await listTaskComments(taskAId, orgAId);
    expect(lista).toHaveLength(2);
    expect(lista[0]!.corpo).toBe('Primeiro comentário');
    expect(lista[1]!.id).toBe(segundoId);
    expect(lista[1]!.corpo).toBe('Segundo comentário');
    expect(lista[0]!.createdAt.getTime()).toBeLessThanOrEqual(lista[1]!.createdAt.getTime());

    const activities = await listTaskActivities(taskAId, orgAId);
    const comentarios = activities.filter((a) => a.evento === 'comentario');
    expect(comentarios).toHaveLength(2);
    expect(comentarios.every((a) => a.userId === userAId)).toBe(true);
  });
});
