import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getSessionContext } from '@/modules/auth/session';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';
import {
  createOlistOAuthAttempt,
  OLIST_OAUTH_COOKIE,
  OLIST_OAUTH_TTL_SECONDS,
  olistCallbackUri,
  olistReturnPath,
} from '@/modules/connections/olist-oauth-attempt';
import { getProviderOAuthCredentials } from '@/modules/connections/provider-connection.repository';
import { getOAuthProvider } from '@/modules/providers/oauth-registry';

const QuerySchema = z.object({
  orgId: z.string().uuid(),
  surface: z.enum(['client_connections', 'analyst_org']),
});

export async function GET(request: Request) {
  const access = await getSessionContext();
  if (!access) return localRedirect('/sign-in');

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    orgId: url.searchParams.get('orgId'),
    surface: url.searchParams.get('surface'),
  });
  if (!parsed.success) return localRedirect('/conexoes', 'olist_parametros_invalidos');

  const returnPath = olistReturnPath(parsed.data.surface, parsed.data.orgId) ?? '/conexoes';
  try {
    await assertConnectionOrgAccess(access, parsed.data.orgId, parsed.data.surface);
    const credentials = await getProviderOAuthCredentials(parsed.data.orgId, 'olist');
    const attempt = createOlistOAuthAttempt({
      orgId: parsed.data.orgId,
      userId: access.id,
      surface: parsed.data.surface,
      credentialVersion: credentials.version,
    });
    const cookieStore = await cookies();
    cookieStore.set(OLIST_OAUTH_COOKIE, attempt.cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(serverEnv.APP_URL).protocol === 'https:',
      maxAge: OLIST_OAUTH_TTL_SECONDS,
      path: '/api/connections/olist/callback',
    });
    return NextResponse.redirect(
      getOAuthProvider('olist').buildAuthorizeUrl({
        credentials: {
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          redirectUri: olistCallbackUri(),
        },
        state: attempt.state,
        codeChallenge: attempt.codeChallenge,
      }),
    );
  } catch (error) {
    const code = safeStartCode(error);
    logger.warn('olist.oauth.start_failed', { provider: 'olist', orgId: parsed.data.orgId, code });
    return localRedirect(returnPath, code);
  }
}

function safeStartCode(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'acesso_negado' || code === 'organizacao_inativa') return code;
  if (code === 'provider_credentials_missing') return 'olist_credenciais_ausentes';
  return 'olist_oauth_transiente';
}

function localRedirect(path: string, error?: string): NextResponse {
  const target = new URL(path, serverEnv.APP_URL);
  if (error) target.searchParams.set('erro', error);
  return NextResponse.redirect(target);
}
