import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskCard } from '@/components/tasks/TaskCard';
import {
  STATUS_TASK_LABEL,
  TASK_STATUSES,
  type TaskAtor,
  type TaskStatus,
  type TaskSummary,
} from '@/modules/tasks/task.types';

function agruparPorStatus(tasks: TaskSummary[]): Record<TaskStatus, TaskSummary[]> {
  const grupos = Object.fromEntries(TASK_STATUSES.map((status) => [status, [] as TaskSummary[]])) as Record<
    TaskStatus,
    TaskSummary[]
  >;
  for (const task of tasks) {
    grupos[task.status]?.push(task);
  }
  for (const status of TASK_STATUSES) {
    grupos[status].sort((a, b) => a.ordem - b.ordem);
  }
  return grupos;
}

export function KanbanBoard({
  tasks,
  ator,
  taskHrefBase,
  orgId,
}: {
  tasks: TaskSummary[];
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
}) {
  const grupos = agruparPorStatus(tasks);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
      {TASK_STATUSES.map((status) => {
        const itens = grupos[status];
        return (
          <div key={status} data-testid={`kanban-col-${status}`} className="w-64 flex-shrink-0 md:w-auto">
            <Card className="flex h-full flex-col gap-3">
              <CardHeader className="mb-0">
                <CardTitle as="h3" className="text-sm">
                  {STATUS_TASK_LABEL[status]}
                </CardTitle>
                <span className="text-xs text-dim">{itens.length}</span>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {itens.length === 0 ? (
                  <EmptyState title="Nenhuma task" className="px-3 py-6" />
                ) : (
                  itens.map((task, indice) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      ator={ator}
                      taskHrefBase={taskHrefBase}
                      orgId={orgId}
                      isFirst={indice === 0}
                      isLast={indice === itens.length - 1}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
