'use server';

import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { signIn, signOut } from '@/modules/auth/auth';
import { createOrgWithUser } from '@/modules/auth/user.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import {
  isLoginRateLimited,
  isSignupRateLimited,
  recordAttempt,
  recordLoginAttempt,
} from '@/modules/auth/rate-limit';

export type ActionState = { error?: string };

const signUpSchema = z.object({
  orgName: z.string().trim().min(2, 'Informe o nome da empresa.'),
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
  aceite: z.literal('on', {
    errorMap: () => ({
      message: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
    }),
  }),
});

const signInSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    orgName: formData.get('orgName'),
    email: formData.get('email'),
    senha: formData.get('senha'),
    aceite: formData.get('aceite'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const forwarded = (await headers()).get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;
  if (await isSignupRateLimited(ip)) {
    return { error: 'Muitos cadastros recentes. Tente novamente em alguns minutos.' };
  }

  try {
    const { orgId, userId } = await createOrgWithUser(parsed.data);
    await recordAudit({ orgId, userId, acao: 'org.criada', detalhes: { via: 'sign-up' } });
  } catch (err) {
    if (err instanceof Error && err.message === 'email_em_uso') {
      // Anti-enumeração: sondas de e-mail existente também contam para o
      // rate-limit de signup por IP (5/h), sem mudar a mensagem exibida.
      await recordAttempt({ escopo: 'signup', email: parsed.data.email, ip, success: false });
      return { error: 'Já existe uma conta com este e-mail.' };
    }
    throw err;
  }

  await recordAttempt({ escopo: 'signup', email: parsed.data.email, ip, success: true });

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
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    senha: formData.get('senha'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { email, senha } = parsed.data;

  const forwarded = (await headers()).get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;

  if (await isLoginRateLimited(email, ip)) {
    return { error: 'Muitas tentativas. Tente novamente em alguns minutos.' };
  }

  try {
    await signIn('credentials', { email, senha, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      await recordLoginAttempt({ email, ip, success: false });
      return { error: 'Credenciais inválidas.' };
    }
    throw err;
  }

  await recordLoginAttempt({ email, ip, success: true });
  redirect('/dashboard');
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/sign-in' });
}
