'use client';
import { useFormState } from 'react-dom';
import { disconnectBlingAction, type ConnState } from '@/actions/connections.actions';
const initial: ConnState = {};
export function DisconnectBling() {
  const [state, action] = useFormState(disconnectBlingAction, initial);
  return (
    <form action={action}>
      <button type="submit" className="border px-2" data-testid="disconnect-bling">Desconectar</button>
      {state.error ? <span className="ml-2 text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
