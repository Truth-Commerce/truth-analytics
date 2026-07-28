'use client';

import { useFormState } from 'react-dom';

import {
  adminCreateClientAccountAction,
  type CriarContaState,
} from '@/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: CriarContaState = {};

export function CriarClienteForm() {
  const [state, action] = useFormState(adminCreateClientAccountAction, initial);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Cria a empresa e o primeiro acesso do responsável juntos. A conta começa pendente para
        você definir o plano antes da ativação.
      </p>
      <form action={action} className="space-y-4" data-testid="usuarios-criar-cliente-form">
        <Field label="Empresa" htmlFor="usuarios-cliente-empresa">
          <Input
            id="usuarios-cliente-empresa"
            name="orgName"
            type="text"
            maxLength={255}
            placeholder="Nome da empresa"
            required
          />
        </Field>
        <Field label="E-mail do responsável" htmlFor="usuarios-cliente-email">
          <Input
            id="usuarios-cliente-email"
            name="email"
            type="email"
            placeholder="responsavel@empresa.com"
            required
          />
        </Field>
        <Button type="submit" variant="primary" size="sm" data-testid="usuarios-criar-cliente-submit">
          Criar cliente
        </Button>
      </form>

      {state.error ? (
        <Alert variant="danger" data-testid="usuarios-criar-cliente-erro">
          {state.error}
        </Alert>
      ) : null}
      {state.ok && state.senhaTemporaria ? (
        <Alert variant="success" title="Cliente criado." data-testid="usuarios-criar-cliente-sucesso">
          <p>
            Envie o acesso: <span className="font-mono">{state.email}</span> · senha temporária{' '}
            <span className="font-mono" data-testid="usuarios-cliente-senha-temporaria">
              {state.senhaTemporaria}
            </span>
          </p>
          <p className="mt-1 text-xs">
            A senha aparece só uma vez. Ative a empresa no painel e oriente o cliente a trocar a
            senha no primeiro acesso.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
