import { AuthError } from 'next-auth';
import { NextResponse } from 'next/server';

import { signIn } from '@/modules/auth/auth';

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '');
  const senha = String(formData.get('senha') ?? '');

  const base = new URL(request.url);
  const origin = base.origin;

  try {
    await signIn('credentials', { email, senha, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.redirect(
        new URL(`/sign-in?error=${encodeURIComponent('Credenciais inválidas.')}`, origin),
        { status: 303 },
      );
    }
    throw err;
  }

  return NextResponse.redirect(new URL('/dashboard', origin), { status: 303 });
}
