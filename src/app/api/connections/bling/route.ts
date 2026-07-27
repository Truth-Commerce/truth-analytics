import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSessionContext } from '@/modules/auth/session';
import { blingProvider } from '@/modules/providers/bling/provider';

export async function GET() {
  const access = await getSessionContext();
  if (!access || access.orgStatus !== 'active') {
    return NextResponse.redirect(new URL('/sign-in', process.env.APP_URL ?? 'http://localhost:3000'));
  }
  try {
    const state = randomBytes(16).toString('hex');
    const cookieStore = await cookies();
    cookieStore.set('bling_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return NextResponse.redirect(blingProvider.buildAuthorizeUrl(state));
  } catch {
    return NextResponse.redirect(
      new URL('/conexoes?erro=bling_indisponivel', process.env.APP_URL ?? 'http://localhost:3000'),
    );
  }
}
