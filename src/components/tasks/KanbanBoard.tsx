'use client';

import { useMemo, useState, useTransition } from 'react';

import { moveTaskAction } from '@/actions/tasks.actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskCard } from '@/components/tasks/TaskCard';
import { useToast } from '@/components/ui/Toast';
import { ordenarColuna } from '@/modules/tasks/kanban-order';
import type { TaskCardInfo } from '@/modules/tasks/task.repository';
import {
  STATUS_TASK_LABEL,
  TASK_STATUSES,
  type TaskAtor,
  type TaskStatus,
} from '@/modules/tasks/task.types';

export function KanbanBoard({
  tasks,
  ator,
  taskHrefBase,
  orgId,
  emptyCta,
}: {
  tasks: TaskCardInfo[];
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
  emptyCta?: React.ReactNode; // Task 12: CTA pro último relatório quando o board está vazio
}) {
  // Otimismo sem useOptimistic (React 18.3): mapa taskId→status aplicado por
  // cima dos dados do servidor; limpo quando a action settla (o
  // revalidatePath da action já terá atualizado a árvore RSC na transition).
  const [movidas, setMovidas] = useState<Record<string, TaskStatus>>({});
  const [, startTransition] = useTransition();
  const [pendenteId, setPendenteId] = useState<string | null>(null);
  const { toast } = useToast();

  const efetivas = useMemo(
    () => tasks.map((t) => (movidas[t.id] ? { ...t, status: movidas[t.id]! } : t)),
    [tasks, movidas],
  );

  function onMove(taskId: string, para: TaskStatus) {
    setMovidas((prev) => ({ ...prev, [taskId]: para }));
    setPendenteId(taskId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('taskId', taskId);
      fd.set('para', para);
      if (orgId) fd.set('orgId', orgId);
      const res = await moveTaskAction(fd);
      if (res.error) {
        toast({ variant: 'error', title: 'Não foi possível mover.', description: res.error });
      }
      setMovidas((prev) => {
        const { [taskId]: _, ...resto } = prev;
        return resto;
      });
      setPendenteId(null);
    });
  }

  if (tasks.length === 0 && emptyCta) {
    return (
      <EmptyState
        title="Nenhuma tarefa no seu Plano de Ação ainda."
        description="Converta os achados do seu último relatório em tarefas com 1 clique."
        action={emptyCta}
        data-testid="kanban-vazio"
      />
    );
  }

  const grupos = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as TaskCardInfo[]])) as Record<
    TaskStatus,
    TaskCardInfo[]
  >;
  for (const t of efetivas) grupos[t.status]?.push(t);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-5">
      {TASK_STATUSES.map((status) => {
        const itens = ordenarColuna(grupos[status]);
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
                  itens.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      ator={ator}
                      taskHrefBase={taskHrefBase}
                      orgId={orgId}
                      onMove={onMove}
                      pendente={pendenteId === task.id}
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
