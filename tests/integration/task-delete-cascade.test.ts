import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, taskActivities, taskWatchers, tasks, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-delete-cascata-';

// ---------------------------------------------------------------------------
// F1 (revisão H5/T11) — deleteTask falhava silenciosamente pra tasks com um
// watcher ou com filhas: migration 0016 adicionou `task_watchers.task_id` e
// `tasks.parent_id` como FKs `ON DELETE no action`, e deleteTask não limpava
// nenhuma das duas antes de apagar a linha — violação de FK no Postgres,
// engolida pelo catch de deleteTaskFormAction (sem nenhum erro na UI).
// ---------------------------------------------------------------------------
describe.skipIf(!url)('deleteTask — cascata de watchers e filhos (fix F1)', () => {
  let orgId = '';
  let userId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'hash', role: 'admin_truth' })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterAll(async () => {
    // FK: task_activities → tasks (recordTaskActivity grava 'criada' pra cada
    // task/épico/subtarefa criada nos testes) — precisa ir antes de `tasks`.
    const restantes = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    const idsRestantes = restantes.map((t) => t.id);
    if (idsRestantes.length > 0) {
      await db.delete(taskActivities).where(inArray(taskActivities.task_id, idsRestantes));
    }
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('exclui uma task que tem um watcher — sem violação de FK, e o watcher some junto', async () => {
    const { createTask, deleteTask } = await import('@/modules/tasks/task.repository');
    const { addWatcher } = await import('@/modules/tasks/watcher.repository');

    const taskId = await createTask({
      orgId,
      titulo: 'Task com watcher',
      tipo: 'outro',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userId,
    });
    await addWatcher(taskId, orgId, userId);

    const watchersAntes = await db.select().from(taskWatchers).where(eq(taskWatchers.task_id, taskId));
    expect(watchersAntes).toHaveLength(1);

    await expect(deleteTask(taskId, orgId)).resolves.toBeUndefined();

    const taskRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(taskRows).toHaveLength(0);
    const watchersDepois = await db.select().from(taskWatchers).where(eq(taskWatchers.task_id, taskId));
    expect(watchersDepois).toHaveLength(0);
  });

  it('exclui um épico com uma task filha — a filha sobrevive, órfã (parent_id=null), não é apagada em cascata', async () => {
    const { criarEpico, criarSubtarefa, deleteTask } = await import('@/modules/tasks/task.repository');

    const epicoId = await criarEpico({
      orgId,
      titulo: 'Épico com filha',
      tipo: 'outro',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userId,
    });
    const filhaId = await criarSubtarefa({
      orgId,
      parentId: epicoId,
      nivel: 'task',
      titulo: 'Filha sobrevivente',
      tipo: 'outro',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: userId,
    });

    await expect(deleteTask(epicoId, orgId)).resolves.toBeUndefined();

    const epicoRows = await db.select().from(tasks).where(eq(tasks.id, epicoId));
    expect(epicoRows).toHaveLength(0);

    const [filhaRow] = await db.select().from(tasks).where(eq(tasks.id, filhaId));
    expect(filhaRow).toBeDefined();
    expect(filhaRow?.parent_id).toBeNull();
  });
});
