import Link from 'next/link';

import { concluirTaskFormAction, moveTaskFormAction, reorderTaskFormAction } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { podeTransicionar } from '@/modules/tasks/task-transitions';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_STATUSES,
  TIPO_TASK_LABEL,
  isTaskAtrasada,
  type TaskAtor,
  type TaskPrioridade,
  type TaskStatus,
  type TaskSummary,
} from '@/modules/tasks/task.types';

const PRIORIDADE_BADGE_VARIANT: Record<TaskPrioridade, 'danger' | 'warn' | 'neutral'> = {
  alta: 'danger',
  media: 'warn',
  baixa: 'neutral',
};

function vizinhoStatus(status: TaskStatus, delta: 1 | -1): TaskStatus | null {
  const indice = TASK_STATUSES.indexOf(status);
  const alvo = indice + delta;
  return alvo >= 0 && alvo < TASK_STATUSES.length ? TASK_STATUSES[alvo] : null;
}

export function TaskCard({
  task,
  ator,
  taskHrefBase,
  orgId,
  isFirst = false,
  isLast = false,
}: {
  task: TaskSummary;
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  // Cliente: em_revisao (aguardando análise) e concluida (encerrada) são
  // só-leitura — nenhum controle de mover/reordenar/concluir é exibido.
  const somenteLeitura = ator === 'cliente' && (task.status === 'em_revisao' || task.status === 'concluida');

  const anterior = vizinhoStatus(task.status, -1);
  const proximo = vizinhoStatus(task.status, 1);

  const podeVoltar =
    !somenteLeitura && anterior !== null &&
    podeTransicionar({ ator, criadoPor: task.criadoPor, de: task.status, para: anterior });

  // Para o cliente, avançar a partir de "Em andamento" é sempre a ação de
  // concluir a própria parte — o destino real (em_revisao ou concluida) é
  // calculado no server por `concluirTaskFormAction` via
  // `proximoStatusAoConcluir(criadoPor)`.
  const mostrarConcluir = !somenteLeitura && ator === 'cliente' && task.status === 'em_andamento';

  const podeAvancar =
    !somenteLeitura && !mostrarConcluir && proximo !== null &&
    podeTransicionar({ ator, criadoPor: task.criadoPor, de: task.status, para: proximo });

  const atrasada = isTaskAtrasada(task);

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
        {atrasada ? <Badge variant="danger">Atrasada</Badge> : null}
      </div>

      {!somenteLeitura ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {podeVoltar ? (
              <form action={moveTaskFormAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="para" value={anterior ?? ''} />
                {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
                <button
                  type="submit"
                  aria-label="Mover para trás"
                  className="rounded-lg px-2 py-1 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  ←
                </button>
              </form>
            ) : null}

            {mostrarConcluir ? (
              <form action={concluirTaskFormAction}>
                <input type="hidden" name="taskId" value={task.id} />
                {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
                <Button type="submit" variant="secondary" size="sm" data-testid="task-concluir">
                  Concluir
                </Button>
              </form>
            ) : podeAvancar ? (
              <form action={moveTaskFormAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="para" value={proximo ?? ''} />
                {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
                <button
                  type="submit"
                  aria-label="Mover para frente"
                  className="rounded-lg px-2 py-1 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  →
                </button>
              </form>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {!isFirst ? (
              <form action={reorderTaskFormAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="direcao" value="up" />
                {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
                <button
                  type="submit"
                  aria-label="Subir na coluna"
                  className="rounded-lg px-2 py-1 text-xs text-dim outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  ↑
                </button>
              </form>
            ) : null}

            {!isLast ? (
              <form action={reorderTaskFormAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="direcao" value="down" />
                {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
                <button
                  type="submit"
                  aria-label="Descer na coluna"
                  className="rounded-lg px-2 py-1 text-xs text-dim outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  ↓
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
