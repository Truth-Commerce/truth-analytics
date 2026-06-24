import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { getSessionContext } from '@/modules/auth/session';
import { saveBlingConnection } from '@/modules/connections/connection.repository';
import { blingProvider } from '@/modules/providers/bling/provider';

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const access = await getSessionContext();
  if (!access || access.orgStatus !== 'active') {
    return NextResponse.redirect(new URL('/sign-in', base));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = cookies().get('bling_oauth_state')?.value;
  cookies().delete('bling_oauth_state');

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL('/conexoes?erro=state_invalido', base));
  }

  try {
    const tokens = await blingProvider.exchangeCode(code);
    await saveBlingConnection(access.orgId, tokens);
    return NextResponse.redirect(new URL('/conexoes?ok=1', base));
  } catch {
    return NextResponse.redirect(new URL('/conexoes?erro=falha_conexao', base));
  }
}
