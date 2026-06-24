'use client';

import { useFormState } from 'react-dom';

import { signUpAction, type ActionState } from '@/actions/auth.actions';

const initial: ActionState = {};

export default function SignUpPage() {
  const [state, action] = useFormState(signUpAction, initial);

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Criar conta</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="orgName" placeholder="Nome da empresa" className="border p-2" />
        <input name="email" type="email" placeholder="E-mail" className="border p-2" />
        <input name="senha" type="password" placeholder="Senha" className="border p-2" />
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" className="bg-black p-2 text-white">Cadastrar</button>
      </form>
    </main>
  );
}
