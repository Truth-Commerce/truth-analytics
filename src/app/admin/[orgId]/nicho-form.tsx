'use client';

import { useFormState } from 'react-dom';

import { updateOrgNichoAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const initial: AdminActionState = {};

type Props = {
  orgId: string;
  nichoAtual: string | null;
};

export function NichoForm({ orgId, nichoAtual }: Props) {
  const [state, formAction] = useFormState(updateOrgNichoAction, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" data-testid="admin-nicho-form">
      <input type="hidden" name="orgId" value={orgId} />
      <Input
        type="text"
        name="nicho"
        maxLength={60}
        defaultValue={nichoAtual ?? ''}
        placeholder="Ex.: Moda feminina"
        aria-label="Nicho da organização"
        className="!w-auto max-w-xs !py-1.5 text-sm"
      />
      <Button type="submit" variant="secondary" size="sm" data-testid="admin-nicho-salvar">
        Salvar
      </Button>
      {state.error ? <span className="text-sm text-danger-fg" role="alert">{state.error}</span> : null}
    </form>
  );
}
