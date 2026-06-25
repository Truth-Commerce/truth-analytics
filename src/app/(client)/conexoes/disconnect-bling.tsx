'use client';
import { useFormState } from 'react-dom';
import { disconnectBlingAction, type ConnState } from '@/actions/connections.actions';
import { Button } from '@/components/ui/Button';

const initial: ConnState = {};

export function DisconnectBling() {
  const [state, action] = useFormState(disconnectBlingAction, initial);
  return (
    <form action={action}>
      <Button type="submit" variant="danger" size="sm" data-testid="disconnect-bling">
        Desconectar
      </Button>
      {state.error ? <span className="ml-2 text-sm text-red-400">{state.error}</span> : null}
    </form>
  );
}
