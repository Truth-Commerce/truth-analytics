import { aprovarTaskFormAction } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TaskSummary } from '@/modules/tasks/task.types';

import { DevolverTaskButton } from './DevolverTaskButton';

type ItemFila = TaskSummary & { orgId: string; orgName: string };

/** Fila global de tasks `em_revisao` das orgs da carteira (Task 11) — usada em `/analista`. */
export function RevisaoQueue({ items }: { items: ItemFila[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhuma task aguardando revisão" />;
  }

  return (
    <ul data-testid="revisao-queue" className="divide-y divide-line rounded-2xl border border-line bg-bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs text-dim">{item.orgName}</p>
            <p className="text-sm font-medium text-white">{item.titulo}</p>
          </div>
          <div className="flex items-center gap-2">
            <form action={aprovarTaskFormAction}>
              <input type="hidden" name="taskId" value={item.id} />
              <input type="hidden" name="orgId" value={item.orgId} />
              <Button type="submit" size="sm" data-testid="aprovar-task">
                Aprovar
              </Button>
            </form>
            <DevolverTaskButton taskId={item.id} orgId={item.orgId} titulo={item.titulo} />
          </div>
        </li>
      ))}
    </ul>
  );
}
