import Link from 'next/link';

import { aprovarTaskFormAction } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { diasDesde, labelPrazo, statusPrazo } from '@/modules/tasks/sla';
import { PRIORIDADE_TASK_LABEL, type TaskPrioridade, type TaskSummary } from '@/modules/tasks/task.types';

import { DevolverTaskButton } from './DevolverTaskButton';

type ItemFila = TaskSummary & { orgId: string; orgName: string; updatedAt: Date };

const PRIORIDADE_VARIANT: Record<TaskPrioridade, 'danger' | 'warn' | 'neutral'> = {
  alta: 'danger',
  media: 'warn',
  baixa: 'neutral',
};

/** Fila global de tasks em revisão das orgs da carteira — usada em /analista. */
export function RevisaoQueue({ items }: { items: ItemFila[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhuma task aguardando revisão" />;
  }

  return (
    <ul data-testid="revisao-queue" className="divide-y divide-line rounded-2xl border border-line bg-bg-surface">
      {items.map((item) => {
        const prazoLabel = labelPrazo(item.prazo);
        const atrasada = statusPrazo(item.prazo) === 'atrasada';
        const aguardando = diasDesde(item.updatedAt);
        return (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-xs text-dim">{item.orgName}</p>
              <Link
                href={`/analista/${item.orgId}/tasks/${item.id}`}
                className="text-sm font-medium text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {item.titulo}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={PRIORIDADE_VARIANT[item.prioridade]}>{PRIORIDADE_TASK_LABEL[item.prioridade]}</Badge>
                {prazoLabel ? <Badge variant={atrasada ? 'danger' : 'neutral'}>{prazoLabel}</Badge> : null}
                <span className="text-xs text-dim">aguardando há {aguardando}d</span>
              </div>
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
        );
      })}
    </ul>
  );
}
