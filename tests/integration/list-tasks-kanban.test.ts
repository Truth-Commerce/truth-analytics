import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, taskActivities, taskComments, tasks, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-kanban-';

describe.skipIf(!url)('listTasksKanban — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  let orgId = '';
  let userId = '';
  let taskRicaId = '';
  let taskVaziaId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [user] = await tdb
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;

    const [rica] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: 'Task rica',
        descricao: 'Livre\n- [x] a\n- [ ] b\n- [ ] c',
        tipo: 'catalogo',
        prioridade: 'alta',
        status: 'todo',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskRicaId = rica!.id;

    const [vazia] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: 'Task vazia',
        descricao: '',
        tipo: 'outro',
        prioridade: 'baixa',
        status: 'backlog',
        criado_por: 'cliente',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskVaziaId = vazia!.id;

    await tdb.insert(taskComments).values([
      { task_id: taskRicaId, user_id: userId, corpo: 'Comentário 1' },
      { task_id: taskRicaId, user_id: userId, corpo: 'Comentário 2' },
    ]);
  });

  afterAll(async () => {
    if (orgId) {
      const taskRows = await tdb.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, [orgId]));
      const taskIds = taskRows.map((r) => r.id);
      if (taskIds.length) {
        await tdb.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
        await tdb.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
      }
      await tdb.delete(tasks).where(inArray(tasks.org_id, [orgId]));
      await tdb.delete(users).where(inArray(users.org_id, [orgId]));
      await tdb.delete(organizations).where(inArray(organizations.id, [orgId]));
    }
    await sql.end();
  });

  it('listTasksKanban traz contagem de comentários e checklist sem N+1', async () => {
    const { listTasksKanban } = await import('@/modules/tasks/task.repository');
    const lista = await listTasksKanban(orgId);
    const rica = lista.find((t) => t.id === taskRicaId)!;
    expect(rica.comentarios).toBe(2);
    expect(rica.checklistFeitos).toBe(1);
    expect(rica.checklistTotal).toBe(3);
    expect(rica.reincidente).toBe(false);
    const vazia = lista.find((t) => t.id === taskVaziaId)!;
    expect(vazia.comentarios).toBe(0);
    expect(vazia.checklistTotal).toBe(0);
  });
});
