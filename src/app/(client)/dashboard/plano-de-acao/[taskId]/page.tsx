import { notFound } from 'next/navigation';

import { TaskDetail } from '@/components/tasks/TaskDetail';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { sugerirLabels } from '@/modules/tasks/labels';
import { listTaskActivities } from '@/modules/tasks/task-activity.repository';
import { listTaskComments } from '@/modules/tasks/task-comment.repository';
import { getTaskImpact } from '@/modules/tasks/task-impact';
import { getPaiEFilhas, getTaskById, listLabelsUsadas } from '@/modules/tasks/task.repository';
import { listWatchers } from '@/modules/tasks/watcher.repository';

export default async function TaskDetalhePage({ params }: { params: { taskId: string } }) {
  const access = await requireActiveOrg();
  const task = await getTaskById(params.taskId, access.orgId);

  if (!task) notFound();

  const [comments, activities, impact, hierarquia, watchers, labelsUsadas] = await Promise.all([
    listTaskComments(task.id, access.orgId),
    listTaskActivities(task.id, access.orgId),
    getTaskImpact(task.id, access.orgId),
    getPaiEFilhas(task.id, access.orgId),
    listWatchers(task.id, access.orgId),
    listLabelsUsadas(access.orgId),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-6 md:p-8">
      <TaskDetail
        task={task}
        ator="cliente"
        orgId={access.orgId}
        comments={comments}
        activities={activities}
        impact={impact}
        backHref="/dashboard/plano-de-acao"
        currentUserId={access.id}
        watchers={watchers}
        sugestoesLabels={sugerirLabels(labelsUsadas)}
        pai={hierarquia?.pai ?? null}
        filhas={hierarquia?.filhas ?? []}
      />
    </main>
  );
}
