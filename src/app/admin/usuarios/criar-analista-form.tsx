'use client';

import { useFormState } from 'react-dom';

import {
  adminCreateAnalystAccountAction,
  type CriarContaState,
} from '@/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: CriarContaState = {};

export function CriarAnalistaForm() {
  const [state, action] = useFormState(adminCreateAnalystAccountAction, initial);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Cria o acesso na operação interna da Truth. A carteira de clientes pode ser atribuída
        depois, sem qualquer configuração técnica pelo analista.
      </p>
      <form action={action} className="space-y-4" data-testid="usuarios-criar-analista-form">
        <Field label="E-mail do analista" htmlFor="usuarios-analista-email">
          <Input
            id="usuarios-analista-email"
            name="email"
            type="email"
            placeholder="analista@truthcommerce.com.br"
            required
          />
        </Field>
        <Button type="submit" variant="primary" size="sm" data-testid="usuarios-criar-analista-submit">
          Criar analista
        </Button>
      </form>

      {state.error ? (
        <Alert variant="danger" data-testid="usuarios-criar-analista-erro">
          {state.error}
        </Alert>
      ) : null}
      {state.ok && state.senhaTemporaria ? (
        <Alert variant="success" title="Analista criado." data-testid="usuarios-criar-analista-sucesso">
          <p>
            Envie o acesso: <span className="font-mono">{state.email}</span> · senha temporária{' '}
            <span className="font-mono" data-testid="usuarios-analista-senha-temporaria">
              {state.senhaTemporaria}
            </span>
          </p>
          <p className="mt-1 text-xs">
            A senha aparece só uma vez. Oriente o analista a trocá-la no primeiro acesso.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
