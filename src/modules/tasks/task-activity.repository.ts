import { desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskActivities, tasks, users } from '@/db/schema';

export async function recordTaskActivity(input: {
  taskId: string;
  userId?: string | null;
  evento: string;
  de?: string | null;
  para?: string | null;
}): Promise<void> {
  await db.insert(taskActivities).values({
    task_id: input.taskId,
    user_id: input.userId ?? null,
    evento: input.evento,
    de: input.de ?? null,
    para: input.para ?? null,
  });
}

export async function listTaskActivities(taskId: string, orgId: string) {
  const rows = await db
    .select({
      id: taskActivities.id,
      evento: taskActivities.evento,
      de: taskActivities.de,
      para: taskActivities.para,
      userId: taskActivities.user_id,
      userEmail: users.email,
      createdAt: taskActivities.created_at,
    })
    .from(taskActivities)
    .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
    // LEFT JOIN: user_id é nullable (eventos de sistema/cron não têm autor).
    .leftJoin(users, eq(taskActivities.user_id, users.id))
    .where(eq(taskActivities.task_id, taskId))
    .orderBy(desc(taskActivities.created_at))
    .limit(50);
  // escopo: valida que a task pertence à org (join não filtra org — checar explícito)
  const [own] = await db.select({ org_id: tasks.org_id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!own || own.org_id !== orgId) return [];
  return rows;
}
