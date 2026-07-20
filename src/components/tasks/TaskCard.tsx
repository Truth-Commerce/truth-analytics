import Link from 'next/link';

import { concluirTaskFormAction } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { progressoEpicoLabel, slaBadge, type SlaBadgeStatus } from '@/modules/tasks/board-view';
import { labelPrazo, statusPrazo } from '@/modules/tasks/sla';
import { podeTransicionar } from '@/modules/tasks/task-transitions';
import type { TaskCardInfo } from '@/modules/tasks/task.repository';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_PRIORIDADES,
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

const SLA_BADGE_LABEL: Record<SlaBadgeStatus, string> = {
  atrasada: 'Atrasada',
  vence: 'Vence em breve',
  ok: 'No prazo',
};

const SLA_BADGE_VARIANT: Record<SlaBadgeStatus, 'danger' | 'warn' | 'neutral'> = {
  atrasada: 'danger',
  vence: 'warn',
  ok: 'neutral',
};

/** Campo editável inline no card (board turbinado — H5/T6). */
export type CampoEdicaoRapida = 'prioridade' | 'prazo' | 'assigneeUserId';

export function TaskCard({
  task,
  ator,
  taskHrefBase,
  orgId,
  onMove,
  pendente,
  usuarios = [],
  onQuickEdit,
  editandoId,
  onReorder,
  arrastando,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragClickCapture,
}: {
  task: TaskCardInfo;
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
  onMove: (taskId: string, para: TaskStatus) => void;
  pendente: boolean;
  /** Usuários da org — opções do select "Responsável" da edição rápida. */
  usuarios?: Array<{ id: string; email: string }>;
  /** Edição rápida (prioridade/prazo/responsável) — omitido = card sem controles (cliente). */
  onQuickEdit?: (taskId: string, campo: CampoEdicaoRapida, valor: string) => void;
  editandoId?: string | null;
  /** Reordenar dentro da coluna (H5/T7) — fallback acessível por botão do drag-and-drop. */
  onReorder?: (taskId: string, direcao: 'up' | 'down') => void;
  /** true enquanto ESTE card é o que está sendo arrastado (dimming visual). */
  arrastando?: boolean;
  /** Drag-and-drop nativo por pointer events (H5/T7) — omitidos = card não-arrastável
   * (ex.: modo com raias, onde o DnD é desligado; ver KanbanBoard). */
  onDragPointerDown?: (e: React.PointerEvent<HTMLDivElement>, taskId: string, status: TaskStatus) => void;
  onDragPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDragPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Suprime o "click fantasma" (ex.: navegação do título) que o navegador
   * dispara depois de um arraste real — ver comentário em KanbanBoard. */
  onDragClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const somenteLeitura = ator === 'cliente' && (task.status === 'em_revisao' || task.status === 'concluida');
  const mostrarConcluir = !somenteLeitura && ator === 'cliente' && task.status === 'em_andamento';
  const podeArrastar = !somenteLeitura && !!onDragPointerDown;
  // Edição rápida é restrita a analista/admin — mesmo guard de updateTaskAction
  // no servidor (o cliente nunca vê os controles; o servidor também bloqueia).
  const podeEditarInline = ator !== 'cliente' && !!onQuickEdit;
  const salvandoEdicao = editandoId === task.id;
  const sla = slaBadge(task);

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
    <div
      data-testid="task-card"
      data-task-id={task.id}
      className={`select-none rounded-xl border border-line bg-bg-elevated p-3 transition-opacity ${
        arrastando ? 'opacity-40' : ''
      } ${podeArrastar ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={podeArrastar ? (e) => onDragPointerDown!(e, task.id, task.status) : undefined}
      onPointerMove={podeArrastar ? onDragPointerMove : undefined}
      onPointerUp={podeArrastar ? onDragPointerUp : undefined}
      onPointerCancel={podeArrastar ? onDragPointerUp : undefined}
      onClickCapture={podeArrastar ? onDragClickCapture : undefined}
    >
      <Link
        href={`${taskHrefBase}/${task.id}`}
        className="text-sm font-medium text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        {task.titulo}
      </Link>

      {task.nivel === 'epico' && task.progresso ? (
        <div className="mt-2 flex items-center gap-2" data-testid={`epico-progresso-${task.id}`}>
          <div className="h-1.5 flex-1 rounded-full bg-white/10">
            <div
              className="h-1.5 rounded-full bg-brand transition-[width]"
              style={{ width: `${task.progresso.pct}%` }}
            />
          </div>
          <span className="whitespace-nowrap font-mono text-[11px] text-dim">
            {progressoEpicoLabel(task.progresso)}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="neutral">{TIPO_TASK_LABEL[task.tipo]}</Badge>
        <Badge variant={PRIORIDADE_BADGE_VARIANT[task.prioridade]}>{PRIORIDADE_TASK_LABEL[task.prioridade]}</Badge>
        {task.reincidente ? <Badge variant="warn">Reincidente</Badge> : null}
        {prazoLabel && task.status !== 'concluida' ? (
          <Badge variant={SLA_BADGE_VARIANT[sla]} data-testid="crm-board-sla-badge">
            {SLA_BADGE_LABEL[sla]}
          </Badge>
        ) : null}
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

      {podeEditarInline ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="crm-board-edicao-rapida">
          <select
            aria-label="Prioridade"
            data-testid={`crm-board-edit-prioridade-${task.id}`}
            value={task.prioridade}
            disabled={salvandoEdicao}
            onChange={(e) => onQuickEdit!(task.id, 'prioridade', e.target.value)}
            className="rounded-lg border border-line bg-bg-elevated px-2 py-1 text-xs text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {TASK_PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_TASK_LABEL[p]}
              </option>
            ))}
          </select>
          <input
            aria-label="Prazo"
            type="date"
            data-testid={`crm-board-edit-prazo-${task.id}`}
            value={task.prazo ?? ''}
            disabled={salvandoEdicao}
            onChange={(e) => onQuickEdit!(task.id, 'prazo', e.target.value)}
            className="rounded-lg border border-line bg-bg-elevated px-2 py-1 text-xs text-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50"
          />
          {usuarios.length > 0 ? (
            // "Sem responsável" é só o placeholder de tasks sem assignee — selecioná-lo
            // não limpa um responsável já definido (limitação conhecida: updateTaskAction
            // não distingue "não enviado" de "string vazia" pro campo assigneeUserId;
            // limpar responsável fica pro form completo de edição, fora do escopo do board).
            <select
              aria-label="Responsável"
              data-testid={`crm-board-edit-responsavel-${task.id}`}
              value={task.assigneeUserId ?? ''}
              disabled={salvandoEdicao}
              onChange={(e) => onQuickEdit!(task.id, 'assigneeUserId', e.target.value)}
              className="rounded-lg border border-line bg-bg-elevated px-2 py-1 text-xs text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <option value="" disabled={task.assigneeUserId !== null}>
                Sem responsável
              </option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {!somenteLeitura ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MoverTaskSelect taskId={task.id} destinosValidos={destinosValidos} onMove={onMove} pendente={pendente} />
            {onReorder ? (
              // Fallback acessível do reorder-por-arraste (H5/T7) — botões de
              // teclado/clique que chamam a MESMA reorderTaskFormAction do drag.
              <span className="flex flex-col" data-testid={`reorder-botoes-${task.id}`}>
                <button
                  type="button"
                  aria-label="Mover para cima na coluna"
                  disabled={pendente}
                  onClick={() => onReorder(task.id, 'up')}
                  className="leading-none text-dim outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="Mover para baixo na coluna"
                  disabled={pendente}
                  onClick={() => onReorder(task.id, 'down')}
                  className="leading-none text-dim outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50"
                >
                  ▼
                </button>
              </span>
            ) : null}
          </div>
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
