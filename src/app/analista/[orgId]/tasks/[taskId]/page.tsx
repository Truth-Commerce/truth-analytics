import { notFound } from 'next/navigation';

import { TaskDetail } from '@/components/tasks/TaskDetail';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { sugerirLabels } from '@/modules/tasks/labels';
import { listTaskActivities } from '@/modules/tasks/task-activity.repository';
import { listTaskComments } from '@/modules/tasks/task-comment.repository';
import { getTaskImpact } from '@/modules/tasks/task-impact';
import { atorFromRole } from '@/modules/tasks/task.types';
import { getPaiEFilhas, getTaskById, listLabelsUsadas } from '@/modules/tasks/task.repository';
import { listWatchers } from '@/modules/tasks/watcher.repository';

export default async function AnalistaTaskDetalhePage(
  props: {
    params: Promise<{ orgId: string; taskId: string }>;
  }
) {
  const params = await props.params;
  const access = await requireAnalista();

  try {
    await assertOrgAccess(access, params.orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') notFound();
    throw e;
  }

  const task = await getTaskById(params.taskId, params.orgId);
  if (!task) notFound();

  const [comments, activities, impact, hierarquia, watchers, labelsUsadas] = await Promise.all([
    listTaskComments(task.id, params.orgId),
    listTaskActivities(task.id, params.orgId),
    getTaskImpact(task.id, params.orgId),
    getPaiEFilhas(task.id, params.orgId),
    listWatchers(task.id, params.orgId),
    listLabelsUsadas(params.orgId),
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
        currentUserId={access.id}
        watchers={watchers}
        sugestoesLabels={sugerirLabels(labelsUsadas)}
        pai={hierarquia?.pai ?? null}
        filhas={hierarquia?.filhas ?? []}
      />
    </main>
  );
}
