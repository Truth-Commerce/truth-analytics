'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';

import { signUpAction, type ActionState } from '@/actions/auth.actions';
import { Logo } from '@/components/ui/Logo';
import { Card, CardContent } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const initial: ActionState = {};

export default function SignUpPage() {
  const [state, action] = useFormState(signUpAction, initial);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo withMark size="lg" />
        <p className="text-sm text-muted">Inteligência de marketplace para o seu e-commerce.</p>
      </div>

      <Card>
        <CardContent>
          <h1 className="mb-6 font-heading text-lg font-semibold text-white">Criar conta</h1>
          <form action={action} className="flex flex-col gap-4">
            <Field label="Nome da empresa" htmlFor="orgName">
              <Input id="orgName" name="orgName" placeholder="Minha Empresa Ltda" autoComplete="organization" />
            </Field>
            <Field label="E-mail" htmlFor="email">
              <Input id="email" name="email" type="email" placeholder="voce@empresa.com" autoComplete="email" />
            </Field>
            <Field label="Senha" htmlFor="senha">
              <Input id="senha" name="senha" type="password" placeholder="••••••••" autoComplete="new-password" />
            </Field>
            {state.error ? (
              <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="mt-2 w-full justify-center">
              Cadastrar
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            Já tem conta?{' '}
            <Link href="/sign-in" className="text-brand hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
