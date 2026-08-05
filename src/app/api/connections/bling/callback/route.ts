import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/lib/env';
import { getSessionContext } from '@/modules/auth/session';
import {
  BLING_OAUTH_COOKIE,
  blingOAuthCookieOptions,
  blingReturnPath,
  verifyBlingOAuthAttempt,
} from '@/modules/connections/bling-oauth-attempt';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';
import { saveBlingConnection } from '@/modules/connections/connection.repository';
import { blingProvider } from '@/modules/providers/bling/provider';

export async function GET(req: NextRequest) {
  const access = await getSessionContext();
  if (!access) return localRedirect('/sign-in');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(BLING_OAUTH_COOKIE)?.value;
  cookieStore.set(BLING_OAUTH_COOKIE, '', { ...blingOAuthCookieOptions(), maxAge: 0 });

  const attempt = code && state && cookieValue
    ? verifyBlingOAuthAttempt({ cookieValue, state, expectedUserId: access.id })
    : null;
  if (!attempt) return localRedirect('/conexoes', 'state_invalido');

  const returnPath = blingReturnPath(attempt.surface, attempt.orgId) ?? '/conexoes';
  try {
    await assertConnectionOrgAccess(access, attempt.orgId, attempt.surface);
    const tokens = await blingProvider.exchangeCode(code!);
    await saveBlingConnection(attempt.orgId, tokens);
    const target = new URL(returnPath, serverEnv.APP_URL);
    if (attempt.surface === 'client_connections') target.searchParams.set('ok', '1');
    else target.searchParams.set('bling', 'conectado');
    return NextResponse.redirect(target);
  } catch {
    return localRedirect(returnPath, 'falha_conexao');
  }
}

function localRedirect(path: string, error?: string): NextResponse {
  const target = new URL(path, serverEnv.APP_URL);
  if (error) target.searchParams.set('erro', error);
  return NextResponse.redirect(target);
}
