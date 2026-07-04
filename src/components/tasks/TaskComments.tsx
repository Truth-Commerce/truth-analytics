'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { addCommentAction, type TaskActionState } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatData } from '@/lib/format';

const initial: TaskActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      Comentar
    </Button>
  );
}

export function TaskComments({
  taskId,
  orgId,
  comments,
}: {
  taskId: string;
  orgId?: string;
  comments: Array<{ id: string; corpo: string; userEmail: string; createdAt: Date }>;
}) {
  const [state, action] = useFormState(addCommentAction, initial);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  useEffect(() => {
    if (state.error) {
      toast({ variant: 'error', title: state.error });
    }
  }, [state, toast]);

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {comments.length === 0 ? (
          <li className="text-sm text-dim">Nenhum comentário ainda.</li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-bg-elevated p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-white/70">{c.userEmail}</span>
                <span className="text-xs text-dim">{formatData(c.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/90">{c.corpo}</p>
            </li>
          ))
        )}
      </ul>

      <form ref={formRef} action={action} data-testid="task-comentario-form" className="space-y-2">
        <input type="hidden" name="taskId" value={taskId} />
        {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <textarea
          name="corpo"
          rows={3}
          maxLength={2000}
          required
          placeholder="Escreva um comentário..."
          className="w-full rounded-lg border border-line bg-bg-elevated px-3 py-2 text-white outline-none transition-colors placeholder:text-dim focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
        />

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
