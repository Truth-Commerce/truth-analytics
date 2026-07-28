import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { serverEnv } from '@/lib/env';

export const OLIST_OAUTH_COOKIE = 'olist_oauth_attempt';
export const OLIST_OAUTH_TTL_SECONDS = 600;

export type OlistOAuthSurface = 'client_connections' | 'analyst_org';

const AttemptPayload = z.object({
  v: z.literal(1),
  provider: z.literal('olist'),
  orgId: z.string().min(1),
  userId: z.string().min(1),
  surface: z.enum(['client_connections', 'analyst_org']),
  state: z.string().min(43),
  codeVerifier: z.string().min(43),
  credentialVersion: z.string().min(1),
  issuedAt: z.number().int().nonnegative(),
});

export type VerifiedOlistOAuthAttempt = z.infer<typeof AttemptPayload>;

export function createOlistOAuthAttempt(input: {
  orgId: string;
  userId: string;
  surface: OlistOAuthSurface;
  credentialVersion: string;
}): {
  cookieValue: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const payload: VerifiedOlistOAuthAttempt = {
    v: 1,
    provider: 'olist',
    orgId: input.orgId,
    userId: input.userId,
    surface: input.surface,
    state,
    codeVerifier,
    credentialVersion: input.credentialVersion,
    issuedAt: Math.floor(Date.now() / 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {
    cookieValue: `${encoded}.${sign(encoded)}`,
    state,
    codeVerifier,
    codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  };
}

export function verifyOlistOAuthAttempt(input: {
  cookieValue: string;
  state: string;
  expectedUserId: string;
  expectedOrgId: string;
}): VerifiedOlistOAuthAttempt | null {
  try {
    const [encoded, signature, extra] = input.cookieValue.split('.');
    if (!encoded || !signature || extra) return null;
    const expectedSignature = sign(encoded);
    const signatureBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }
    const payload = AttemptPayload.parse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
    );
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.issuedAt;
    if (ageSeconds < 0 || ageSeconds > OLIST_OAUTH_TTL_SECONDS) return null;
    if (payload.state !== input.state) return null;
    if (payload.userId !== input.expectedUserId) return null;
    if (payload.orgId !== input.expectedOrgId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function olistCallbackUri(): string {
  return new URL('/api/connections/olist/callback', serverEnv.APP_URL).toString();
}

export function olistReturnPath(surface: string, orgId: string): string | null {
  if (surface === 'client_connections') return '/conexoes';
  if (surface === 'analyst_org') return `/analista/${encodeURIComponent(orgId)}?tab=conexao`;
  return null;
}

function sign(encoded: string): string {
  return createHmac('sha256', serverEnv.AUTH_SECRET).update(encoded).digest('base64url');
}
