'use client';

import { STATUS_TASK_LABEL, type TaskStatus } from '@/modules/tasks/task.types';

/** Select "Mover para…": só destinos válidos (podeTransicionar, calculado pelo pai). */
export function MoverTaskSelect({
  taskId,
  destinosValidos,
  onMove,
  pendente,
}: {
  taskId: string;
  destinosValidos: TaskStatus[];
  onMove: (taskId: string, para: TaskStatus) => void;
  pendente: boolean;
}) {
  if (destinosValidos.length === 0) return null;
  return (
    <select
      aria-label="Mover para"
      data-testid={`mover-task-${taskId}`}
      value=""
      disabled={pendente}
      onChange={(e) => {
        const para = e.target.value as TaskStatus;
        if (para) onMove(taskId, para);
      }}
      className="max-w-full rounded-lg border border-line bg-bg-elevated px-2 py-1 text-xs text-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <option value="" disabled>
        Mover para…
      </option>
      {destinosValidos.map((s) => (
        <option key={s} value={s}>
          {STATUS_TASK_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
