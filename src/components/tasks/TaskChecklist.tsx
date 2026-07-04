'use client';

import { toggleChecklistItemFormAction } from '@/actions/tasks.actions';

export function TaskChecklist({
  taskId,
  itens,
  orgId,
}: {
  taskId: string;
  itens: Array<{ texto: string; feito: boolean }>;
  orgId?: string;
}) {
  if (itens.length === 0) return null;

  return (
    <ul data-testid="task-checklist" className="space-y-1.5">
      {itens.map((item, index) => (
        <li key={index}>
          <form action={toggleChecklistItemFormAction} className="flex items-start gap-2">
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="index" value={index} />
            {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
            <input
              type="checkbox"
              defaultChecked={item.feito}
              data-testid={`task-checklist-item-${index}`}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="mt-1 h-4 w-4 shrink-0 rounded border-line bg-bg-elevated accent-brand"
            />
            <span className={`text-sm leading-relaxed ${item.feito ? 'text-dim line-through' : 'text-white/90'}`}>
              {item.texto}
            </span>
          </form>
        </li>
      ))}
    </ul>
  );
}
