'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { staffBackfillHistoricoAction, type StaffBackfillState } from '@/actions/staff.actions';
import { Button } from '@/components/ui/Button';

const initialState: StaffBackfillState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending} data-testid="desempenho-backfill">
      {pending ? 'Sincronizando…' : 'Sincronizar histórico (12 meses)'}
    </Button>
  );
}

export function BackfillHistorico({ orgId }: { orgId: string }) {
  const [state, action] = useFormState(staffBackfillHistoricoAction, initialState);
  return (
    <form action={action} className="text-right">
      <input type="hidden" name="orgId" value={orgId} />
      <Submit />
      {state.error ? <p className="mt-1 text-xs text-danger-fg">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-1 text-xs text-muted">
          {state.processados} pedidos sincronizados
          {state.pendentesEnriquecimento ? ` · ${state.pendentesEnriquecimento} aguardando enriquecimento (o cron completa em ~1h)` : ''}
        </p>
      ) : null}
    </form>
  );
}
