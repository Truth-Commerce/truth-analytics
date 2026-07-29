import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
const adapter = {
  name: 'olist' as const,
  buildAuthorizeUrl: vi.fn(() => 'https://accounts.tiny.com.br/authorize'),
  exchangeCode: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock('@/lib/env', () => ({
  serverEnv: {
    APP_URL: 'https://truth-analytics.vercel.app',
    AUTH_SECRET: 'route-test-secret',
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/modules/auth/session', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/modules/connections/connection-access', () => ({ assertConnectionOrgAccess: vi.fn() }));
vi.mock('@/modules/connections/provider-connection.repository', () => ({
  getProviderOAuthCredentials: vi.fn(),
  saveProviderTokens: vi.fn(),
}));
vi.mock('@/modules/connections/olist-oauth-attempt', () => ({
  OLIST_OAUTH_COOKIE: 'olist_oauth_attempt',
  OLIST_OAUTH_TTL_SECONDS: 600,
  createOlistOAuthAttempt: vi.fn(),
  olistOAuthCookieOptions: vi.fn(() => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/api/connections/olist/callback',
  })),
  verifyOlistOAuthAttempt: vi.fn(),
  olistCallbackUri: vi.fn(() =>
    'https://truth-analytics.vercel.app/api/connections/olist/callback'),
  olistReturnPath: vi.fn((surface: string, orgId: string) =>
    surface === 'client_connections' ? '/conexoes' : `/analista/${orgId}?tab=conexao`),
}));
vi.mock('@/modules/providers/oauth-registry', () => ({ getOAuthProvider: vi.fn(() => adapter) }));
vi.mock('@/modules/providers/olist/account', () => ({ loadAndBindOlistAccount: vi.fn() }));

import { getSessionContext } from '@/modules/auth/session';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';
import {
  getProviderOAuthCredentials,
  saveProviderTokens,
} from '@/modules/connections/provider-connection.repository';
import {
  createOlistOAuthAttempt,
  verifyOlistOAuthAttempt,
} from '@/modules/connections/olist-oauth-attempt';
import { GET as start } from '@/app/api/connections/olist/route';
import { GET as callback } from '@/app/api/connections/olist/callback/route';
import { loadAndBindOlistAccount } from '@/modules/providers/olist/account';

const access = {
  id: 'user-a',
  orgId: ORG_ID,
  role: 'client' as const,
  orgStatus: 'active' as const,
  plano: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionContext).mockResolvedValue(access);
  vi.mocked(getProviderOAuthCredentials).mockResolvedValue({
    clientId: 'client',
    clientSecret: 'secret',
    version: 'version-a',
  });
  vi.mocked(createOlistOAuthAttempt).mockReturnValue({
    cookieValue: 'signed-cookie',
    state: 'state-a',
    codeVerifier: 'verifier-a',
    codeChallenge: 'challenge-a',
  });
  vi.mocked(verifyOlistOAuthAttempt).mockReturnValue({
    v: 1,
    provider: 'olist',
    orgId: ORG_ID,
    userId: 'user-a',
    surface: 'client_connections',
    state: 'state-a',
    codeVerifier: 'verifier-a',
    credentialVersion: 'version-a',
    issuedAt: 1,
  });
  cookieStore.get.mockReturnValue({ value: 'signed-cookie' });
  adapter.exchangeCode.mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresInSeconds: 14_400,
  });
  vi.mocked(saveProviderTokens).mockResolvedValue(true);
  vi.mocked(loadAndBindOlistAccount).mockResolvedValue({ fingerprint: 'a'.repeat(64), sourceGeneration: 2 });
});

describe('GET /api/connections/olist', () => {
  it('redireciona sessão ausente para sign-in', async () => {
    vi.mocked(getSessionContext).mockResolvedValueOnce(null);
    const response = await start(
      new Request(`https://attacker.example/api/connections/olist?orgId=${ORG_ID}&surface=client_connections`),
    );
    expect(response.headers.get('location')).toBe('https://truth-analytics.vercel.app/sign-in');
  });

  it('rejeita org/surface inválidos antes de ler credenciais', async () => {
    const response = await start(
      new Request('https://attacker.example/api/connections/olist?orgId=nope&surface=invalid'),
    );
    expect(response.headers.get('location')).toContain('olist_parametros_invalidos');
    expect(getProviderOAuthCredentials).not.toHaveBeenCalled();
  });

  it('valida acesso, cria cookie seguro e autoriza com callback fixa', async () => {
    const response = await start(
      new Request(`https://attacker.example/api/connections/olist?orgId=${ORG_ID}&surface=client_connections`),
    );
    expect(assertConnectionOrgAccess).toHaveBeenCalledWith(access, ORG_ID, 'client_connections');
    expect(cookieStore.set).toHaveBeenCalledWith(
      'olist_oauth_attempt',
      'signed-cookie',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        maxAge: 600,
        path: '/api/connections/olist/callback',
      }),
    );
    expect(adapter.buildAuthorizeUrl).toHaveBeenCalledWith({
      credentials: {
        clientId: 'client',
        clientSecret: 'secret',
        redirectUri: 'https://truth-analytics.vercel.app/api/connections/olist/callback',
      },
      state: 'state-a',
      codeChallenge: 'challenge-a',
    });
    expect(response.headers.get('location')).toBe('https://accounts.tiny.com.br/authorize');
  });
});

describe('GET /api/connections/olist/callback', () => {
  it('expira no path original antes de trocar o code e salva por compare-and-swap', async () => {
    adapter.exchangeCode.mockImplementationOnce(async () => {
      expect(cookieStore.set).toHaveBeenCalledWith(
        'olist_oauth_attempt',
        '',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          secure: true,
          path: '/api/connections/olist/callback',
          maxAge: 0,
        }),
      );
      expect(cookieStore.delete).not.toHaveBeenCalled();
      return { accessToken: 'access', refreshToken: 'refresh', expiresInSeconds: 14_400 };
    });
    const response = await callback(
      new Request(
        'https://attacker.example/api/connections/olist/callback?code=code-a&state=state-a',
      ),
    );
    expect(assertConnectionOrgAccess).toHaveBeenCalledWith(access, ORG_ID, 'client_connections');
    expect(adapter.exchangeCode).toHaveBeenCalledWith({
      credentials: {
        clientId: 'client',
        clientSecret: 'secret',
        redirectUri: 'https://truth-analytics.vercel.app/api/connections/olist/callback',
      },
      code: 'code-a',
      codeVerifier: 'verifier-a',
    });
    expect(saveProviderTokens).toHaveBeenCalledWith(expect.objectContaining({
      orgId: ORG_ID,
      provider: 'olist',
      credentialVersion: 'version-a',
    }));
    expect(loadAndBindOlistAccount).toHaveBeenCalledWith(ORG_ID);
    expect(response.headers.get('location')).toContain('/conexoes?olist=conectado');
  });

  it.each([
    ['missing cookie', undefined, true],
    ['tampered state', { value: 'signed-cookie' }, false],
  ])('rejeita %s sem exchange', async (_label, cookie, valid) => {
    cookieStore.get.mockReturnValueOnce(cookie);
    if (!valid) vi.mocked(verifyOlistOAuthAttempt).mockReturnValueOnce(null);
    const response = await callback(
      new Request(
        'https://attacker.example/api/connections/olist/callback?code=code-a&state=state-a',
      ),
    );
    expect(response.headers.get('location')).toContain('olist_state_invalido');
    expect(adapter.exchangeCode).not.toHaveBeenCalled();
  });

  it('não salva se acesso foi revogado', async () => {
    vi.mocked(assertConnectionOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
    await callback(
      new Request(
        'https://attacker.example/api/connections/olist/callback?code=code-a&state=state-a',
      ),
    );
    expect(adapter.exchangeCode).not.toHaveBeenCalled();
    expect(saveProviderTokens).not.toHaveBeenCalled();
  });

  it('não troca code quando versão de credenciais mudou', async () => {
    vi.mocked(getProviderOAuthCredentials).mockResolvedValueOnce({
      clientId: 'new-client',
      clientSecret: 'new-secret',
      version: 'version-b',
    });
    await callback(
      new Request(
        'https://attacker.example/api/connections/olist/callback?code=code-a&state=state-a',
      ),
    );
    expect(adapter.exchangeCode).not.toHaveBeenCalled();
    expect(saveProviderTokens).not.toHaveBeenCalled();
  });

  it('mapeia access_denied sem chamar exchange', async () => {
    const response = await callback(
      new Request(
        'https://attacker.example/api/connections/olist/callback?error=access_denied&state=state-a',
      ),
    );
    expect(response.headers.get('location')).toContain('olist_autorizacao_negada');
    expect(adapter.exchangeCode).not.toHaveBeenCalled();
  });
});
