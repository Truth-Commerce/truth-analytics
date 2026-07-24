'use client';

import { useFormState } from 'react-dom';

import { adminCreateOrgUserAction, type CriarUsuarioState } from '@/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: CriarUsuarioState = {};

type Usuario = { id: string; email: string; createdAt: string };

export function OrgUsers({ orgId, usuarios }: { orgId: string; usuarios: Usuario[] }) {
  const [state, action] = useFormState(adminCreateOrgUserAction, initial);

  return (
    <div className="space-y-4">
      <ul className="flex flex-col divide-y divide-line" data-testid="org-users-list">
        {usuarios.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-mono text-ink/90">{u.email}</span>
            <span className="text-xs text-dim">desde {u.createdAt}</span>
          </li>
        ))}
      </ul>

      <form action={action} className="flex flex-wrap items-end gap-3" data-testid="criar-usuario-form">
        <input type="hidden" name="orgId" value={orgId} />
        <Field label="E-mail do novo usuário" htmlFor="novo-usuario-email" className="min-w-64 flex-1">
          <Input id="novo-usuario-email" name="email" type="email" placeholder="socio@empresa.com" />
        </Field>
        <Button type="submit" variant="primary" size="sm">
          Criar usuário
        </Button>
      </form>

      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok && state.senhaTemporaria ? (
        <Alert variant="success" title="Usuário criado.">
          <p>
            Envie ao cliente o acesso: <span className="font-mono">{state.email}</span> · senha
            temporária{' '}
            <span className="font-mono" data-testid="senha-temporaria">
              {state.senhaTemporaria}
            </span>
          </p>
          <p className="mt-1 text-xs">
            Esta senha aparece só uma vez. Oriente o cliente a trocá-la em Configurações após o
            primeiro acesso.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
