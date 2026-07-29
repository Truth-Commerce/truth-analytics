import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getSessionContext } from '@/modules/auth/session';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';
import {
  OLIST_OAUTH_COOKIE,
  olistCallbackUri,
  olistOAuthCookieOptions,
  olistReturnPath,
  verifyOlistOAuthAttempt,
} from '@/modules/connections/olist-oauth-attempt';
import {
  getProviderOAuthCredentials,
} from '@/modules/connections/provider-connection.repository';
import { getOAuthProvider } from '@/modules/providers/oauth-registry';
import { OAuthProviderError } from '@/modules/providers/oauth.types';
import { loadAndBindOlistAccount } from '@/modules/providers/olist/account';

export async function GET(request: Request) {
  const access = await getSessionContext();
  if (!access) return localRedirect('/sign-in');

  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const remoteError = url.searchParams.get('error');
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(OLIST_OAUTH_COOKIE)?.value;
  cookieStore.set(OLIST_OAUTH_COOKIE, '', {
    ...olistOAuthCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });

  const fallback = access.role === 'client' ? '/conexoes' : '/analista';
  if (!cookieValue || !state) return localRedirect(fallback, 'olist_state_invalido');
  const attempt = verifyOlistOAuthAttempt({
    cookieValue,
    state,
    expectedUserId: access.id,
  });
  if (!attempt) return localRedirect(fallback, 'olist_state_invalido');
  const returnPath = olistReturnPath(attempt.surface, attempt.orgId) ?? fallback;
  if (remoteError === 'access_denied') {
    return localRedirect(returnPath, 'olist_autorizacao_negada');
  }
  if (!code || remoteError) return localRedirect(returnPath, 'olist_autorizacao_falhou');

  try {
    await assertConnectionOrgAccess(access, attempt.orgId, attempt.surface);
    const credentials = await getProviderOAuthCredentials(attempt.orgId, 'olist');
    if (credentials.version !== attempt.credentialVersion) {
      return localRedirect(returnPath, 'olist_credenciais_alteradas');
    }
    const tokens = await getOAuthProvider('olist').exchangeCode({
      credentials: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        redirectUri: olistCallbackUri(),
      },
      code,
      codeVerifier: attempt.codeVerifier,
    });
    // Do not publish an operational Olist connection until its stable account binding
    // and the exchanged token set win the same credential CAS.
    await loadAndBindOlistAccount(attempt.orgId, {
      credentialVersion: attempt.credentialVersion,
      tokens,
    });
    return localRedirect(returnPath, undefined, 'conectado');
  } catch (error) {
    const safeCode = callbackErrorCode(error);
    logger.warn('olist.oauth.callback_failed', {
      provider: 'olist',
      orgId: attempt.orgId,
      code: safeCode,
    });
    return localRedirect(returnPath, safeCode);
  }
}

function callbackErrorCode(error: unknown): string {
  if (error instanceof OAuthProviderError) {
    return error.kind === 'permanent' ? 'olist_autorizacao_falhou' : 'olist_oauth_transiente';
  }
  const code = error instanceof Error ? error.message : '';
  if (code === 'acesso_negado' || code === 'organizacao_inativa') return code;
  if (code === 'provider_credentials_missing') return 'olist_credenciais_alteradas';
  if (code === 'olist_conta_nao_validada' || code === 'olist_account_fingerprint_key_invalid') return 'olist_conta_nao_validada';
  return 'olist_oauth_transiente';
}

function localRedirect(path: string, error?: string, success?: string): NextResponse {
  const target = new URL(path, serverEnv.APP_URL);
  if (error) target.searchParams.set('erro', error);
  if (success) target.searchParams.set('olist', success);
  return NextResponse.redirect(target);
}
