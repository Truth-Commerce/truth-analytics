'use client';

import { useFormState } from 'react-dom';

import { setOrgAnalistaAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

const initial: AdminActionState = {};

type Props = {
  orgId: string;
  analistas: Array<{ id: string; email: string }>;
  analistaAtual: { id: string; email: string } | null;
};

export function AtribuirAnalista({ orgId, analistas, analistaAtual }: Props) {
  const [state, formAction] = useFormState(setOrgAnalistaAction, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <span className="text-sm text-muted">
        Analista atual:{' '}
        <span className="text-white/90">{analistaAtual?.email ?? 'nenhum'}</span>
      </span>
      <Select
        name="analistaUserId"
        defaultValue={analistaAtual?.id ?? ''}
        className="!w-auto !py-1.5 text-sm"
        aria-label="Selecionar analista"
      >
        <option value="">Sem analista</option>
        {analistas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.email}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" size="sm" data-testid="atribuir-analista">
        Atribuir
      </Button>
      {state.error ? <span className="text-sm text-danger-fg">{state.error}</span> : null}
    </form>
  );
}
