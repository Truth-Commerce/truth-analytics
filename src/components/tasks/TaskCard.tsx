import Link from 'next/link';

import { concluirTaskFormAction } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { labelPrazo, statusPrazo } from '@/modules/tasks/sla';
import { podeTransicionar } from '@/modules/tasks/task-transitions';
import type { TaskCardInfo } from '@/modules/tasks/task.repository';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_STATUSES,
  TIPO_TASK_LABEL,
  type TaskAtor,
  type TaskPrioridade,
  type TaskStatus,
} from '@/modules/tasks/task.types';

import { MoverTaskSelect } from './MoverTaskSelect';

const PRIORIDADE_BADGE_VARIANT: Record<TaskPrioridade, 'danger' | 'warn' | 'neutral'> = {
  alta: 'danger',
  media: 'warn',
  baixa: 'neutral',
};

export function TaskCard({
  task,
  ator,
  taskHrefBase,
  orgId,
  onMove,
  pendente,
}: {
  task: TaskCardInfo;
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
  onMove: (taskId: string, para: TaskStatus) => void;
  pendente: boolean;
}) {
  const somenteLeitura = ator === 'cliente' && (task.status === 'em_revisao' || task.status === 'concluida');
  const mostrarConcluir = !somenteLeitura && ator === 'cliente' && task.status === 'em_andamento';

  // Única porta de transição: podeTransicionar. O select só OFERECE o que ele
  // aprova; o servidor revalida em moveTask. Para o cliente, o avanço a partir
  // de em_andamento é o botão Concluir (destino calculado no server) — o
  // destino de conclusão sai da lista do select para não duplicar o caminho.
  const destinosValidos = TASK_STATUSES.filter(
    (para) =>
      !somenteLeitura &&
      para !== task.status &&
      !(mostrarConcluir && ['em_revisao', 'concluida'].includes(para)) &&
      podeTransicionar({ ator, criadoPor: task.criadoPor, de: task.status, para }),
  );

  const prazoLabel = labelPrazo(task.prazo);
  const prazoStatus = statusPrazo(task.status === 'concluida' ? null : task.prazo);

  return (
    <div data-testid="task-card" className="rounded-xl border border-line bg-bg-elevated p-3">
      <Link
        href={`${taskHrefBase}/${task.id}`}
        className="text-sm font-medium text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        {task.titulo}
      </Link>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="neutral">{TIPO_TASK_LABEL[task.tipo]}</Badge>
        <Badge variant={PRIORIDADE_BADGE_VARIANT[task.prioridade]}>{PRIORIDADE_TASK_LABEL[task.prioridade]}</Badge>
        {task.reincidente ? <Badge variant="warn">Reincidente</Badge> : null}
        {prazoStatus === 'atrasada' ? <Badge variant="danger">Atrasada</Badge> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-dim">
        {prazoLabel && task.status !== 'concluida' ? (
          <span className={prazoStatus === 'vence_em_breve' ? 'text-warning-fg' : undefined}>{prazoLabel}</span>
        ) : null}
        {task.checklistTotal > 0 ? (
          <span aria-label={`Checklist: ${task.checklistFeitos} de ${task.checklistTotal}`}>
            ☑ {task.checklistFeitos}/{task.checklistTotal}
          </span>
        ) : null}
        {task.comentarios > 0 ? (
          <span aria-label={`${task.comentarios} comentário(s)`}>💬 {task.comentarios}</span>
        ) : null}
      </div>

      {!somenteLeitura ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <MoverTaskSelect taskId={task.id} destinosValidos={destinosValidos} onMove={onMove} pendente={pendente} />
          {mostrarConcluir ? (
            <form action={concluirTaskFormAction}>
              <input type="hidden" name="taskId" value={task.id} />
              {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
              <Button type="submit" variant="secondary" size="sm" data-testid="task-concluir">
                Concluir
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
