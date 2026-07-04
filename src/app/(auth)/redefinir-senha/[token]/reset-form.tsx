'use client';

import { useFormState } from 'react-dom';

import { resetPasswordAction, type ResetState } from '@/actions/password-reset.actions';
import { Logo } from '@/components/ui/Logo';
import { Card, CardContent } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const initial: ResetState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useFormState(resetPasswordAction, initial);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo withMark size="lg" />
        <p className="text-sm text-muted">Defina sua nova senha.</p>
      </div>

      <Card>
        <CardContent>
          <h1 className="mb-6 font-heading text-lg font-semibold text-white">Redefinir senha</h1>
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <Field label="Nova senha" htmlFor="senha">
              <Input id="senha" name="senha" type="password" placeholder="••••••••" autoComplete="new-password" />
            </Field>
            {state.error ? (
              <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400" data-testid="reset-erro">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="mt-2 w-full justify-center" data-testid="reset-submit-button">
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
