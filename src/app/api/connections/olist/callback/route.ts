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
  type VerifiedOlistOAuthAttempt,
} from '@/modules/connections/olist-oauth-attempt';
import {
  getProviderOAuthCredentials,
  getOlistPublicationContext,
} from '@/modules/connections/provider-connection.repository';
import { getOAuthProvider } from '@/modules/providers/oauth-registry';
import { OAuthProviderError } from '@/modules/providers/oauth.types';
import { loadAndBindOlistAccount } from '@/modules/providers/olist/account';

export async function GET(request: Request) {
  const access = await getSessionContext();
  if (!access) return localRedirect('/sign-in');
  const controller = new AbortController();
  const deadlineAt = Date.now() + 30_000;
  const deadlineTimer = setTimeout(() => controller.abort(), Math.max(0, deadlineAt - Date.now()));
  const lifecycle = { signal: controller.signal, deadlineAt };
  let attempt: VerifiedOlistOAuthAttempt | null = null;
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code');
    const remoteError = url.searchParams.get('error');
    const cookieStore = await withinLifecycle(() => cookies(), lifecycle);
    const cookieValue = cookieStore.get(OLIST_OAUTH_COOKIE)?.value;
    cookieStore.set(OLIST_OAUTH_COOKIE, '', {
      ...olistOAuthCookieOptions(),
      maxAge: 0,
      expires: new Date(0),
    });

    const fallback = access.role === 'client' ? '/conexoes' : '/analista';
    if (!cookieValue || !state) return localRedirect(fallback, 'olist_state_invalido');
    const verifiedAttempt = verifyOlistOAuthAttempt({
      cookieValue,
      state,
      expectedUserId: access.id,
    });
    if (!verifiedAttempt) return localRedirect(fallback, 'olist_state_invalido');
    attempt = verifiedAttempt;
    const returnPath = olistReturnPath(verifiedAttempt.surface, verifiedAttempt.orgId) ?? fallback;
    if (remoteError === 'access_denied') return localRedirect(returnPath, 'olist_autorizacao_negada');
    if (!code || remoteError) return localRedirect(returnPath, 'olist_autorizacao_falhou');

    await withinLifecycle(() => assertConnectionOrgAccess(access, verifiedAttempt.orgId, verifiedAttempt.surface), lifecycle);
    const credentials = await withinLifecycle(() => getProviderOAuthCredentials(verifiedAttempt.orgId, 'olist'), lifecycle);
    if (credentials.version !== verifiedAttempt.credentialVersion) {
      return localRedirect(returnPath, 'olist_credenciais_alteradas');
    }
    const publication = await withinLifecycle(() => getOlistPublicationContext(verifiedAttempt.orgId), lifecycle);
    if (publication.credentialVersion !== verifiedAttempt.credentialVersion) {
      return localRedirect(returnPath, 'olist_credenciais_alteradas');
    }
    // The same deadline/signal fences every external and persistence step. A
    // cancelled request may finish its provider request, but can never publish.
    const tokens = await getOAuthProvider('olist').exchangeCode({
      credentials: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        redirectUri: olistCallbackUri(),
      },
      code,
      codeVerifier: verifiedAttempt.codeVerifier,
      ...lifecycle,
    });
    // Do not publish an operational Olist connection until its stable account binding
    // and the exchanged token set win the same credential CAS.
    await loadAndBindOlistAccount(verifiedAttempt.orgId, {
      credentialVersion: verifiedAttempt.credentialVersion,
      sourceGeneration: publication.dataGeneration,
      tokens,
      ...lifecycle,
    });
    return localRedirect(returnPath, undefined, 'conectado');
  } catch (error) {
    const fallback = access.role === 'client' ? '/conexoes' : '/analista';
    if (!attempt) return localRedirect(fallback, 'olist_oauth_transiente');
    const returnPath = olistReturnPath(attempt.surface, attempt.orgId) ?? fallback;
    const safeCode = callbackErrorCode(error);
    logger.warn('olist.oauth.callback_failed', {
      provider: 'olist',
      orgId: attempt.orgId,
      code: safeCode,
    });
    return localRedirect(returnPath, safeCode);
  } finally {
    clearTimeout(deadlineTimer);
  }
}

function withinLifecycle<T>(operation: () => T | Promise<T>, lifecycle: { signal: AbortSignal; deadlineAt: number }): Promise<T> {
  if (lifecycle.signal.aborted || lifecycle.deadlineAt <= Date.now()) {
    return Promise.reject(new OAuthProviderError('olist_token_erro_transiente', 'transient'));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new OAuthProviderError('olist_token_erro_transiente', 'transient'));
    lifecycle.signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(operation).then(resolve, reject).finally(() => lifecycle.signal.removeEventListener('abort', abort));
  });
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
