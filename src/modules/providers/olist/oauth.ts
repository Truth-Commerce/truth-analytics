import { z } from 'zod';

import {
  OAuthProviderError,
  type OAuthClientCredentials,
  type OAuthRequestLifecycle,
} from '@/modules/providers/oauth.types';
import type { OAuthTokens } from '@/modules/providers/types';

const AUTHORIZE_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth';
const TOKEN_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
const MAX_RETRY_AFTER_SECONDS = 30;
export const OLIST_TOKEN_REQUEST_TIMEOUT_MS = 10_000;

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive(),
  refresh_expires_in: z.coerce.number().int().positive().optional(),
  scope: z.string().optional(),
});

export function buildAuthorizeUrl(input: {
  credentials: OAuthClientCredentials;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', input.credentials.clientId);
  url.searchParams.set('redirect_uri', input.credentials.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCode(input: {
  credentials: OAuthClientCredentials;
  code: string;
  codeVerifier: string;
} & OAuthRequestLifecycle): Promise<OAuthTokens> {
  return requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      redirect_uri: input.credentials.redirectUri,
      code: input.code,
      code_verifier: input.codeVerifier,
    }), input.signal, input.deadlineAt,
  );
}

export async function refresh(input: {
  credentials: OAuthClientCredentials;
  refreshToken: string;
} & OAuthRequestLifecycle): Promise<OAuthTokens> {
  return requestTokens(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      refresh_token: input.refreshToken,
    }), input.signal, input.deadlineAt,
  );
}

async function requestTokens(body: URLSearchParams, signal?: AbortSignal, deadlineAt?: number): Promise<OAuthTokens> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted || (deadlineAt !== undefined && deadlineAt <= Date.now())) throw new OAuthProviderError('olist_token_erro_transiente', 'transient');
    let result: { response: Response; tokens?: OAuthTokens };
    try {
      result = await requestTokenAttempt(body, signal, deadlineAt);
    } catch (error) {
      if (error instanceof OAuthProviderError) throw error;
      if (attempt === 0) continue;
      throw new OAuthProviderError('olist_token_erro_transiente', 'transient');
    }

    if (result.tokens) return result.tokens;
    const response = result.response;
    if (response.ok) throw new OAuthProviderError('olist_token_resposta_invalida', 'permanent');
    if (response.status === 400 || response.status === 401) {
      throw new OAuthProviderError('olist_token_erro_permanente', 'permanent');
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 0) {
        await wait(retryDelayMs(response), signal, deadlineAt);
        continue;
      }
      throw new OAuthProviderError('olist_token_erro_transiente', 'transient');
    }
    throw new OAuthProviderError('olist_token_erro_permanente', 'permanent');
  }
  throw new OAuthProviderError('olist_token_erro_transiente', 'transient');
}

async function requestTokenAttempt(body: URLSearchParams, signal?: AbortSignal, deadlineAt?: number): Promise<{ response: Response; tokens?: OAuthTokens }> {
  return withTimeout(async (attemptSignal) => {
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      signal: attemptSignal,
    });
    return response.ok ? { response, tokens: await parseTokens(response) } : { response };
  }, signal, deadlineAt);
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, deadlineAt?: number): Promise<T> {
  const controller = new AbortController();
  const remaining = deadlineAt === undefined ? OLIST_TOKEN_REQUEST_TIMEOUT_MS : Math.max(0, deadlineAt - Date.now());
  const timeout = setTimeout(() => controller.abort(), Math.min(OLIST_TOKEN_REQUEST_TIMEOUT_MS, remaining));
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    return await new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException('aborted', 'AbortError'));
      combined.addEventListener('abort', abort, { once: true });
      operation(combined).then(
        (value) => { combined.removeEventListener('abort', abort); resolve(value); },
        (error) => { combined.removeEventListener('abort', abort); reject(error); },
      );
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseTokens(response: Response): Promise<OAuthTokens> {
  try {
    const parsed = TokenResponse.parse(await response.json());
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiresInSeconds: parsed.expires_in,
      refreshExpiresInSeconds: parsed.refresh_expires_in ?? 86_400,
      ...(parsed.scope ? { scope: parsed.scope } : {}),
    };
  } catch {
    throw new OAuthProviderError('olist_token_resposta_invalida', 'permanent');
  }
}

function retryDelayMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS) * 1000;
}

function wait(ms: number, signal?: AbortSignal, deadlineAt?: number): Promise<void> {
  const delay = Math.min(ms, deadlineAt === undefined ? ms : Math.max(0, deadlineAt - Date.now()));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new OAuthProviderError('olist_token_erro_transiente', 'transient')); }, { once: true });
  });
}
