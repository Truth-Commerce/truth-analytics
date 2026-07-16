'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';

import { changePasswordAction, type AccountState } from '@/actions/account.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: AccountState = {};

export function TrocarSenhaForm() {
  const [state, action] = useFormState(changePasswordAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" data-testid="trocar-senha-form">
      <Field label="Senha atual" htmlFor="senhaAtual">
        <Input id="senhaAtual" name="senhaAtual" type="password" autoComplete="current-password" />
      </Field>
      <Field label="Nova senha" htmlFor="novaSenha">
        <Input id="novaSenha" name="novaSenha" type="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirmar nova senha" htmlFor="confirmarSenha">
        <Input id="confirmarSenha" name="confirmarSenha" type="password" autoComplete="new-password" />
      </Field>
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert variant="success">Senha alterada com sucesso.</Alert> : null}
      <div>
        <Button type="submit" variant="primary" size="sm">
          Alterar senha
        </Button>
      </div>
    </form>
  );
}
