'use client';

import { followTaskFormAction, unfollowTaskFormAction } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';

/**
 * Watchers (H5/T5): lista de quem observa a task + botão seguir/deixar de
 * seguir do PRÓPRIO usuário logado (nunca observa em nome de outro — a
 * action sempre usa `access.id` da sessão, não um userId vindo do form).
 */
export function TaskWatchers({
  taskId,
  orgId,
  watchers,
  currentUserId,
}: {
  taskId: string;
  orgId?: string;
  watchers: Array<{ userId: string; email: string; role: string }>;
  currentUserId: string;
}) {
  const seguindo = watchers.some((w) => w.userId === currentUserId);
  const action = seguindo ? unfollowTaskFormAction : followTaskFormAction;

  return (
    <div data-testid="crm-watchers" className="space-y-3">
      <ul data-testid="crm-watchers-list" className="flex flex-wrap gap-1.5">
        {watchers.length === 0 ? (
          <li className="text-xs text-dim">Ninguém observando ainda.</li>
        ) : (
          watchers.map((w) => (
            <li
              key={w.userId}
              className="rounded-full border border-line bg-bg-elevated px-2.5 py-1 text-xs text-white/80"
            >
              {w.email}
            </li>
          ))
        )}
      </ul>

      <form action={action}>
        <input type="hidden" name="taskId" value={taskId} />
        {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
        <Button type="submit" size="sm" variant="secondary" data-testid="crm-watch-toggle">
          {seguindo ? 'Deixar de seguir' : 'Seguir'}
        </Button>
      </form>
    </div>
  );
}
