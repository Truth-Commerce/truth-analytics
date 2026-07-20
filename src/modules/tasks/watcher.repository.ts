import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskWatchers, tasks, users } from '@/db/schema';
import { getTaskById } from './task.repository';

export type Watcher = { userId: string; email: string; role: string };

/**
 * Passa a observar uma task (org-scoped: lança 'task_nao_encontrada' se a
 * task não pertencer a orgId). Idempotente — observar de novo não duplica
 * nem lança (unique index task_watchers_task_user_unique).
 */
export async function addWatcher(taskId: string, orgId: string, userId: string): Promise<void> {
  const task = await getTaskById(taskId, orgId);
  if (!task) throw new Error('task_nao_encontrada');
  await db.insert(taskWatchers).values({ task_id: taskId, user_id: userId }).onConflictDoNothing();
}

/**
 * Para de observar uma task (org-scoped: lança 'task_nao_encontrada' se a
 * task não pertencer a orgId). Remover quem não observava é no-op silencioso.
 */
export async function removeWatcher(taskId: string, orgId: string, userId: string): Promise<void> {
  const task = await getTaskById(taskId, orgId);
  if (!task) throw new Error('task_nao_encontrada');
  await db
    .delete(taskWatchers)
    .where(and(eq(taskWatchers.task_id, taskId), eq(taskWatchers.user_id, userId)));
}

/**
 * Lista os watchers de uma task, org-scoped via JOIN com tasks (o join filtra
 * por org_id — task de outra org não devolve nenhuma linha, mesmo que o
 * taskId exista).
 */
export async function listWatchers(taskId: string, orgId: string): Promise<Watcher[]> {
  return db
    .select({ userId: taskWatchers.user_id, email: users.email, role: users.role })
    .from(taskWatchers)
    .innerJoin(tasks, and(eq(taskWatchers.task_id, tasks.id), eq(tasks.org_id, orgId)))
    .innerJoin(users, eq(taskWatchers.user_id, users.id))
    .where(eq(taskWatchers.task_id, taskId));
}
