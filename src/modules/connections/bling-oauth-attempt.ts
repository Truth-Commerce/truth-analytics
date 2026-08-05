import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { serverEnv } from '@/lib/env';
import type { OlistOAuthSurface as ConnectionOAuthSurface } from '@/modules/connections/olist-oauth-attempt';

export const BLING_OAUTH_COOKIE = 'bling_oauth_attempt';
export const BLING_OAUTH_TTL_SECONDS = 600;
export const BLING_OAUTH_COOKIE_PATH = '/api/connections/bling/callback';

const AttemptPayload = z.object({
  v: z.literal(1),
  provider: z.literal('bling'),
  orgId: z.string().min(1),
  userId: z.string().min(1),
  surface: z.enum(['client_connections', 'analyst_org']),
  state: z.string().min(32),
  issuedAt: z.number().int().nonnegative(),
});

export type VerifiedBlingOAuthAttempt = z.infer<typeof AttemptPayload>;

export function createBlingOAuthAttempt(input: {
  orgId: string;
  userId: string;
  surface: ConnectionOAuthSurface;
}): { cookieValue: string; state: string } {
  const payload: VerifiedBlingOAuthAttempt = {
    v: 1,
    provider: 'bling',
    orgId: input.orgId,
    userId: input.userId,
    surface: input.surface,
    state: randomBytes(32).toString('base64url'),
    issuedAt: Math.floor(Date.now() / 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { cookieValue: `${encoded}.${sign(encoded)}`, state: payload.state };
}

export function verifyBlingOAuthAttempt(input: {
  cookieValue: string;
  state: string;
  expectedUserId: string;
}): VerifiedBlingOAuthAttempt | null {
  try {
    const [encoded, signature, extra] = input.cookieValue.split('.');
    if (!encoded || !signature || extra) return null;
    const actual = Buffer.from(signature, 'base64url');
    const expected = Buffer.from(sign(encoded), 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = AttemptPayload.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
    const age = Math.floor(Date.now() / 1000) - payload.issuedAt;
    if (age < 0 || age > BLING_OAUTH_TTL_SECONDS) return null;
    if (!constantTimeEqual(payload.state, input.state)) return null;
    if (payload.userId !== input.expectedUserId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function blingOAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: new URL(serverEnv.APP_URL).protocol === 'https:',
    path: BLING_OAUTH_COOKIE_PATH,
  };
}

export function blingReturnPath(surface: string, orgId: string): string | null {
  if (surface === 'client_connections') return '/conexoes';
  if (surface === 'analyst_org') return `/analista/${encodeURIComponent(orgId)}?tab=conexao`;
  return null;
}

function sign(encoded: string): string {
  return createHmac('sha256', serverEnv.AUTH_SECRET).update(encoded).digest('base64url');
}

function constantTimeEqual(left: string, right: string): boolean {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}
