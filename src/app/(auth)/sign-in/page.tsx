'use client';

import { useFormState } from 'react-dom';

import { signInAction, type ActionState } from '@/actions/auth.actions';

const initial: ActionState = {};

export default function SignInPage() {
  const [state, action] = useFormState(signInAction, initial);

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Entrar</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="E-mail" className="border p-2" />
        <input name="senha" type="password" placeholder="Senha" className="border p-2" />
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" className="bg-black p-2 text-white">Entrar</button>
      </form>
    </main>
  );
}
