import { serverEnv } from '@/lib/env';
import type { OAuthTokens } from '@/modules/providers/types';

function creds() {
  const { BLING_CLIENT_ID, BLING_CLIENT_SECRET, BLING_REDIRECT_URI } = serverEnv;
  if (!BLING_CLIENT_ID || !BLING_CLIENT_SECRET || !BLING_REDIRECT_URI) {
    throw new Error('bling_oauth_nao_configurado');
  }
  return { id: BLING_CLIENT_ID, secret: BLING_CLIENT_SECRET, redirect: BLING_REDIRECT_URI };
}

export function buildAuthorizeUrl(state: string): string {
  const c = creds();
  const u = new URL(`${serverEnv.BLING_API_BASE}/oauth/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', c.id);
  u.searchParams.set('redirect_uri', c.redirect);
  u.searchParams.set('state', state);
  return u.toString();
}

function parseTokens(json: Record<string, unknown>): OAuthTokens {
  return {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    expiresInSeconds: Number(json.expires_in),
    scope: json.scope ? String(json.scope) : undefined,
  };
}

const RETRY_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TokenAttempt =
  | { ok: true; tokens: OAuthTokens }
  | { ok: false; permanente: boolean; retryDelayMs: number };

/**
 * UMA tentativa no endpoint de token, classificando a falha:
 * - 400/401 (invalid_grant/invalid_client) → permanente: o refresh_token não
 *   vale mais; retry não ajuda.
 * - 429/5xx ou erro de rede → transitória: honra Retry-After (cap 30s), senão
 *   1s — mesmo padrão de backoff do fetchBling (orders.ts), reduzido a 1 retry.
 */
async function tokenRequestAttempt(body: URLSearchParams): Promise<TokenAttempt> {
  const c = creds();
  const basic = Buffer.from(`${c.id}:${c.secret}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${serverEnv.BLING_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
  } catch {
    return { ok: false, permanente: false, retryDelayMs: RETRY_DELAY_MS };
  }
  if (res.ok) {
    return { ok: true, tokens: parseTokens((await res.json()) as Record<string, unknown>) };
  }
  if (res.status === 400 || res.status === 401) {
    return { ok: false, permanente: true, retryDelayMs: 0 };
  }
  const retryAfter = Number(res.headers.get('retry-after'));
  const retryDelayMs =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
      : RETRY_DELAY_MS;
  return { ok: false, permanente: false, retryDelayMs };
}

/**
 * Falha permanente (400/401) → Error('bling_refresh_invalido') imediato.
 * Falha transitória (429/5xx/rede) → 1 retry curto; persistindo →
 * Error('bling_refresh_transiente') — quem chama NÃO deve marcar a conexão
 * como expirada nesse caso (o refresh_token continua válido).
 */
async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const primeira = await tokenRequestAttempt(body);
  if (primeira.ok) return primeira.tokens;
  if (primeira.permanente) throw new Error('bling_refresh_invalido');

  await sleep(primeira.retryDelayMs);
  const segunda = await tokenRequestAttempt(body);
  if (segunda.ok) return segunda.tokens;
  throw new Error(segunda.permanente ? 'bling_refresh_invalido' : 'bling_refresh_transiente');
}

export function exchangeCode(code: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code });
  return tokenRequest(body);
}

export function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return tokenRequest(body);
}
