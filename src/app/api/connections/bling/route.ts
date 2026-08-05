import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serverEnv } from '@/lib/env';
import { getSessionContext } from '@/modules/auth/session';
import {
  BLING_OAUTH_COOKIE,
  BLING_OAUTH_TTL_SECONDS,
  blingOAuthCookieOptions,
  blingReturnPath,
  createBlingOAuthAttempt,
} from '@/modules/connections/bling-oauth-attempt';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';
import { blingProvider } from '@/modules/providers/bling/provider';

const QuerySchema = z.object({
  orgId: z.string().uuid(),
  surface: z.enum(['client_connections', 'analyst_org']),
});

export async function GET(request: Request) {
  const access = await getSessionContext();
  if (!access) return redirect('/sign-in');

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    orgId: url.searchParams.get('orgId'),
    surface: url.searchParams.get('surface'),
  });
  if (!parsed.success) return redirect('/conexoes', 'bling_parametros_invalidos');

  const returnPath = blingReturnPath(parsed.data.surface, parsed.data.orgId) ?? '/conexoes';
  try {
    await assertConnectionOrgAccess(access, parsed.data.orgId, parsed.data.surface);
    const attempt = createBlingOAuthAttempt({
      orgId: parsed.data.orgId,
      userId: access.id,
      surface: parsed.data.surface,
    });
    const cookieStore = await cookies();
    cookieStore.set(BLING_OAUTH_COOKIE, attempt.cookieValue, {
      ...blingOAuthCookieOptions(),
      maxAge: BLING_OAUTH_TTL_SECONDS,
    });
    return NextResponse.redirect(blingProvider.buildAuthorizeUrl(attempt.state));
  } catch (error) {
    const code = error instanceof Error && ['acesso_negado', 'organizacao_inativa'].includes(error.message)
      ? error.message
      : 'bling_indisponivel';
    return redirect(returnPath, code);
  }
}

function redirect(path: string, error?: string): NextResponse {
  const target = new URL(path, serverEnv.APP_URL);
  if (error) target.searchParams.set('erro', error);
  return NextResponse.redirect(target);
}
