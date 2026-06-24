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

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const c = creds();
  const basic = Buffer.from(`${c.id}:${c.secret}`).toString('base64');
  const res = await fetch(`${serverEnv.BLING_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error('bling_token_falhou');
  return parseTokens((await res.json()) as Record<string, unknown>);
}

export function exchangeCode(code: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code });
  return tokenRequest(body);
}

export function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return tokenRequest(body);
}
