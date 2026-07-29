'use client';

import { useFormState } from 'react-dom';

import { adminSetUserRoleAction, type ContaState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { UserRole } from '@/modules/auth/user.types';

const initial: ContaState = {};

const OPCOES: Array<{ value: UserRole; label: string }> = [
  { value: 'admin_truth', label: 'Admin Truth' },
  { value: 'analista', label: 'Analista' },
  { value: 'client', label: 'Cliente' },
];

/**
 * Troca de papel de um usuário existente. O submit é explícito (não é
 * onChange) para que uma seleção acidental não altere permissão.
 */
export function PapelForm({ userId, role }: { userId: string; role: UserRole }) {
  const [state, action] = useFormState(adminSetUserRoleAction, initial);

  return (
    <div className="space-y-1">
      <form action={action} className="flex items-center gap-2" data-testid={`papel-form-${userId}`}>
        <input type="hidden" name="userId" value={userId} />
        <Select
          name="role"
          defaultValue={role}
          className="!w-auto !py-1.5 text-sm"
          aria-label="Papel do usuário"
        >
          {OPCOES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm" data-testid={`papel-salvar-${userId}`}>
          Salvar
        </Button>
      </form>
      {state.error ? (
        <p className="text-xs text-danger-fg" data-testid={`papel-erro-${userId}`}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-xs text-success-fg" data-testid={`papel-ok-${userId}`}>
          {state.mensagem}
        </p>
      ) : null}
    </div>
  );
}
