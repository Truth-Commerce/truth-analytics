import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskComments, users } from '@/db/schema';
import { getTaskById } from './task.repository';
import { recordTaskActivity } from './task-activity.repository';

export async function addTaskComment(input: {
  taskId: string; orgId: string; userId: string; corpo: string;
}): Promise<string> {
  const task = await getTaskById(input.taskId, input.orgId);
  if (!task) throw new Error('task_nao_encontrada');
  const [row] = await db
    .insert(taskComments)
    .values({ task_id: input.taskId, user_id: input.userId, corpo: input.corpo })
    .returning({ id: taskComments.id });
  await recordTaskActivity({ taskId: input.taskId, userId: input.userId, evento: 'comentario' });
  return row!.id;
}

export async function listTaskComments(taskId: string, orgId: string) {
  const task = await getTaskById(taskId, orgId);
  if (!task) return [];
  return db
    .select({
      id: taskComments.id,
      corpo: taskComments.corpo,
      userId: taskComments.user_id,
      userEmail: users.email,
      createdAt: taskComments.created_at,
    })
    .from(taskComments)
    .innerJoin(users, eq(taskComments.user_id, users.id))
    .where(eq(taskComments.task_id, taskId))
    .orderBy(asc(taskComments.created_at))
    .limit(100);
}
