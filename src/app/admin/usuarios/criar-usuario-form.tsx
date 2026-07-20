'use client';

import { useFormState } from 'react-dom';

import { adminCreateUserAction, type CriarUsuarioCrossOrgState } from '@/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { OrgOption } from '@/modules/admin/admin.repository';

const initial: CriarUsuarioCrossOrgState = {};

export function CriarUsuarioForm({ orgs }: { orgs: OrgOption[] }) {
  const [state, action] = useFormState(adminCreateUserAction, initial);

  return (
    <div className="space-y-4">
      <form
        action={action}
        className="flex flex-wrap items-end gap-3"
        data-testid="usuarios-criar-form"
      >
        <Field label="E-mail" htmlFor="usuarios-criar-email" className="min-w-64 flex-1">
          <Input id="usuarios-criar-email" name="email" type="email" placeholder="pessoa@empresa.com" />
        </Field>
        <Field label="Organização" htmlFor="usuarios-criar-org" className="min-w-56">
          <Select id="usuarios-criar-org" name="orgId" data-testid="usuarios-criar-org">
            <option value="">Selecione…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.isInternal ? ' (interna)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Papel" htmlFor="usuarios-criar-role" className="min-w-40">
          <Select id="usuarios-criar-role" name="role" data-testid="usuarios-criar-role" defaultValue="client">
            <option value="client">client</option>
            <option value="analista">analista</option>
          </Select>
        </Field>
        <Button type="submit" variant="primary" size="sm" data-testid="usuarios-criar-submit">
          Criar usuário
        </Button>
      </form>

      {state.error ? (
        <Alert variant="danger" data-testid="usuarios-criar-erro">
          {state.error}
        </Alert>
      ) : null}
      {state.ok && state.senhaTemporaria ? (
        <Alert variant="success" title="Usuário criado." data-testid="usuarios-criar-sucesso">
          <p>
            Envie o acesso: <span className="font-mono">{state.email}</span> · senha temporária{' '}
            <span className="font-mono" data-testid="usuarios-senha-temporaria">
              {state.senhaTemporaria}
            </span>
          </p>
          <p className="mt-1 text-xs">
            Esta senha aparece só uma vez. Oriente a pessoa a trocá-la (ou use &quot;gerar link de
            reset&quot; na lista abaixo) no primeiro acesso.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
