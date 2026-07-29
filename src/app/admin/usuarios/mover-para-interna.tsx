'use client';

import { useFormState } from 'react-dom';

import { adminMoveUserToInternalOrgAction, type ContaState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';

const initial: ContaState = {};

/**
 * Analista/admin lotado na organização de um cliente é uma bomba-relógio: a
 * purga LGPD daquela org apaga o usuário junto. Este botão corrige a lotação.
 */
export function MoverParaInterna({ userId }: { userId: string }) {
  const [state, action] = useFormState(adminMoveUserToInternalOrgAction, initial);

  return (
    <div className="space-y-1">
      <form action={action} data-testid={`mover-form-${userId}`}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="ghost" size="sm" data-testid={`mover-btn-${userId}`}>
          Mover para a operação interna
        </Button>
      </form>
      {state.error ? <p className="text-xs text-danger-fg">{state.error}</p> : null}
    </div>
  );
}
