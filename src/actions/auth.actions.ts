'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { signIn } from '@/modules/auth/auth';
import { createOrgWithUser } from '@/modules/auth/user.repository';
import { recordAudit } from '@/modules/audit/audit.repository';

export type ActionState = { error?: string };

const signUpSchema = z.object({
  orgName: z.string().trim().min(2, 'Informe o nome da empresa.'),
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
});

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    orgName: formData.get('orgName'),
    email: formData.get('email'),
    senha: formData.get('senha'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const { orgId, userId } = await createOrgWithUser(parsed.data);
    await recordAudit({ orgId, userId, acao: 'org.criada', detalhes: { via: 'sign-up' } });
  } catch (err) {
    if (err instanceof Error && err.message === 'email_em_uso') {
      return { error: 'Já existe uma conta com este e-mail.' };
    }
    throw err;
  }

  await signIn('credentials', {
    email: parsed.data.email,
    senha: parsed.data.senha,
    redirect: false,
  });

  redirect('/aguardando');
}

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      senha: String(formData.get('senha') ?? ''),
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Credenciais inválidas.' };
    }
    throw err;
  }

  redirect('/dashboard');
}
