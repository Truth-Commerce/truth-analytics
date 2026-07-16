'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';

import {
  requestPasswordResetAction,
  type ResetRequestState,
} from '@/actions/password-reset.actions';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/ui/Logo';
import { Card, CardContent } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const initial: ResetRequestState = {};

export default function EsqueciSenhaPage() {
  const [state, action] = useFormState(requestPasswordResetAction, initial);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo withMark size="lg" />
        <p className="text-sm text-muted">Recupere o acesso à sua conta.</p>
      </div>

      <Card>
        <CardContent>
          <h1 className="mb-6 font-heading text-lg font-semibold text-white">Esqueci minha senha</h1>
          {state.ok ? (
            <Alert variant="success" data-testid="reset-solicitado">
              Se existir uma conta com este e-mail, enviamos as instruções de redefinição.
            </Alert>
          ) : (
            <form action={action} className="flex flex-col gap-4">
              <Field label="E-mail" htmlFor="email">
                <Input id="email" name="email" type="email" placeholder="voce@empresa.com" autoComplete="email" />
              </Field>
              {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
              <Button type="submit" variant="primary" className="mt-2 w-full justify-center" data-testid="reset-request-button">
                Enviar instruções
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted">
            Lembrou a senha?{' '}
            <Link href="/sign-in" className="text-brand hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
