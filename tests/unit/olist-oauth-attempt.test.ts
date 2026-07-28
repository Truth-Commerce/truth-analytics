import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { AUTH_SECRET } = vi.hoisted(() => ({
  AUTH_SECRET: 'auth-secret-for-olist-attempt-tests',
}));
vi.mock('@/lib/env', () => ({
  serverEnv: {
    AUTH_SECRET,
    APP_URL: 'https://truth-analytics.vercel.app',
  },
}));

import {
  createOlistOAuthAttempt,
  OLIST_OAUTH_COOKIE,
  OLIST_OAUTH_TTL_SECONDS,
  olistCallbackUri,
  olistReturnPath,
  verifyOlistOAuthAttempt,
} from '@/modules/connections/olist-oauth-attempt';

const now = new Date('2026-07-28T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe('Olist OAuth attempt', () => {
  it('cria state, verifier e challenge PKCE fortes e verificáveis', () => {
    const attempt = createOlistOAuthAttempt({
      orgId: 'org-a',
      userId: 'user-a',
      surface: 'client_connections',
      credentialVersion: 'version-a',
    });

    expect(OLIST_OAUTH_COOKIE).toBe('olist_oauth_attempt');
    expect(OLIST_OAUTH_TTL_SECONDS).toBe(600);
    expect(attempt.state.length).toBeGreaterThanOrEqual(43);
    expect(attempt.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(attempt.codeChallenge).toBe(
      createHash('sha256').update(attempt.codeVerifier).digest('base64url'),
    );
    expect(
      verifyOlistOAuthAttempt({
        cookieValue: attempt.cookieValue,
        state: attempt.state,
        expectedUserId: 'user-a',
        expectedOrgId: 'org-a',
      }),
    ).toMatchObject({
      provider: 'olist',
      orgId: 'org-a',
      userId: 'user-a',
      surface: 'client_connections',
      credentialVersion: 'version-a',
      codeVerifier: attempt.codeVerifier,
    });
  });

  it.each([
    ['signature', (cookie: string, state: string) => `${cookie.slice(0, -1)}x`, undefined],
    ['state', (cookie: string) => cookie, 'wrong-state'],
  ] as const)('rejeita %s adulterado', (_label, mutateCookie, changedState) => {
    const attempt = createOlistOAuthAttempt({
      orgId: 'org-a',
      userId: 'user-a',
      surface: 'client_connections',
      credentialVersion: 'version-a',
    });
    expect(
      verifyOlistOAuthAttempt({
        cookieValue: mutateCookie(attempt.cookieValue, attempt.state),
        state: changedState ?? attempt.state,
        expectedUserId: 'user-a',
        expectedOrgId: 'org-a',
      }),
    ).toBeNull();
  });

  it('rejeita tentativa com mais de dez minutos', () => {
    const attempt = createOlistOAuthAttempt({
      orgId: 'org-a',
      userId: 'user-a',
      surface: 'client_connections',
      credentialVersion: 'version-a',
    });
    vi.setSystemTime(new Date(now.getTime() + 601_000));
    expect(
      verifyOlistOAuthAttempt({
        cookieValue: attempt.cookieValue,
        state: attempt.state,
        expectedUserId: 'user-a',
        expectedOrgId: 'org-a',
      }),
    ).toBeNull();
  });

  it.each([
    ['wrong user', 'user-b', 'org-a'],
    ['wrong org', 'user-a', 'org-b'],
  ])('rejeita %s', (_label, expectedUserId, expectedOrgId) => {
    const attempt = createOlistOAuthAttempt({
      orgId: 'org-a',
      userId: 'user-a',
      surface: 'client_connections',
      credentialVersion: 'version-a',
    });
    expect(
      verifyOlistOAuthAttempt({
        cookieValue: attempt.cookieValue,
        state: attempt.state,
        expectedUserId,
        expectedOrgId,
      }),
    ).toBeNull();
  });

  it('rejeita provider diferente mesmo com assinatura válida', () => {
    const attempt = createOlistOAuthAttempt({
      orgId: 'org-a',
      userId: 'user-a',
      surface: 'client_connections',
      credentialVersion: 'version-a',
    });
    const [encoded] = attempt.cookieValue.split('.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    payload.provider = 'bling';
    const changed = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', AUTH_SECRET).update(changed).digest('base64url');

    expect(
      verifyOlistOAuthAttempt({
        cookieValue: `${changed}.${signature}`,
        state: attempt.state,
        expectedUserId: 'user-a',
        expectedOrgId: 'org-a',
      }),
    ).toBeNull();
  });

  it('expõe callback fixa e somente retornos allowlisted', () => {
    expect(olistCallbackUri()).toBe(
      'https://truth-analytics.vercel.app/api/connections/olist/callback',
    );
    expect(olistReturnPath('client_connections', 'org-a')).toBe('/conexoes');
    expect(olistReturnPath('analyst_org', 'org-a')).toBe('/analista/org-a?tab=conexao');
    expect(olistReturnPath('invalid', 'org-a')).toBeNull();
  });
});
