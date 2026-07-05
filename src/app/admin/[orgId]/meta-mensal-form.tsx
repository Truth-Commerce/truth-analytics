'use client';

import { useFormState } from 'react-dom';

import { setMetaMensalAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatBRL } from '@/lib/format';

const initial: AdminActionState = {};

type Props = {
  orgId: string;
  metaAtual: number | null;
};

export function MetaMensalForm({ orgId, metaAtual }: Props) {
  const [state, formAction] = useFormState(setMetaMensalAction, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <span className="text-sm text-muted">
        Meta atual:{' '}
        <span className="font-mono text-white/90">
          {metaAtual !== null ? formatBRL(metaAtual) : 'não definida'}
        </span>
      </span>
      <Input
        type="number"
        name="meta"
        step="0.01"
        min="0.01"
        defaultValue={metaAtual ?? ''}
        placeholder="Ex.: 15000"
        aria-label="Meta mensal em reais"
        className="!w-auto max-w-[10rem] !py-1.5 text-sm"
      />
      <Button type="submit" variant="secondary" size="sm" data-testid="salvar-meta-mensal">
        Salvar
      </Button>
      {state.error ? <span className="text-sm text-danger-fg" role="alert">{state.error}</span> : null}
    </form>
  );
}
