import { notFound } from 'next/navigation';

import { TaskDetail } from '@/components/tasks/TaskDetail';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { listTaskActivities } from '@/modules/tasks/task-activity.repository';
import { listTaskComments } from '@/modules/tasks/task-comment.repository';
import { getTaskImpact } from '@/modules/tasks/task-impact';
import { atorFromRole } from '@/modules/tasks/task.types';
import { getTaskById } from '@/modules/tasks/task.repository';

export default async function AnalistaTaskDetalhePage({
  params,
}: {
  params: { orgId: string; taskId: string };
}) {
  const access = await requireAnalista();

  try {
    await assertOrgAccess(access, params.orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') notFound();
    throw e;
  }

  const task = await getTaskById(params.taskId, params.orgId);
  if (!task) notFound();

  const [comments, activities, impact] = await Promise.all([
    listTaskComments(task.id, params.orgId),
    listTaskActivities(task.id, params.orgId),
    getTaskImpact(task.id, params.orgId),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-6 md:p-8">
      <TaskDetail
        task={task}
        ator={atorFromRole(access.role)}
        orgId={params.orgId}
        comments={comments}
        activities={activities}
        impact={impact}
        backHref={`/analista/${params.orgId}`}
      />
    </main>
  );
}
