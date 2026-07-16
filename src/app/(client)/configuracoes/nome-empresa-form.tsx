'use client';

import { useFormState } from 'react-dom';

import { updateOrgNameAction, type AccountState } from '@/actions/account.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: AccountState = {};

export function NomeEmpresaForm({ nomeAtual }: { nomeAtual: string }) {
  const [state, action] = useFormState(updateOrgNameAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="nome-empresa-form">
      <Field label="Nome da empresa" htmlFor="nome">
        <Input id="nome" name="nome" defaultValue={nomeAtual} autoComplete="organization" />
      </Field>
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert variant="success">Nome atualizado.</Alert> : null}
      <div>
        <Button type="submit" variant="primary" size="sm">
          Salvar
        </Button>
      </div>
    </form>
  );
}
