import { afterEach, describe, expect, it, vi } from 'vitest';

import { OAuthProviderError } from '@/modules/providers/oauth.types';
import { olistOAuthProvider } from '@/modules/providers/olist/provider';
import { OLIST_TOKEN_REQUEST_TIMEOUT_MS } from '@/modules/providers/olist/oauth';

const credentials = {
  clientId: 'olist-client',
  clientSecret: 'olist-secret',
  redirectUri: 'https://truth-analytics.vercel.app/api/connections/olist/callback',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Olist OAuth adapter', () => {
  it('monta autorização OIDC com PKCE S256 e callback fixa', () => {
    const url = new URL(
      olistOAuthProvider.buildAuthorizeUrl({
        credentials,
        state: 'state-1',
        codeChallenge: 'challenge-1',
      }),
    );

    expect(url.origin + url.pathname).toBe(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'olist-client',
      redirect_uri: credentials.redirectUri,
      response_type: 'code',
      scope: 'openid',
      state: 'state-1',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
    });
  });

  it('troca code usando credenciais, callback e verifier no corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 14_400,
          refresh_expires_in: 86_400,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await olistOAuthProvider.exchangeCode({
      credentials,
      code: 'code-1',
      codeVerifier: 'verifier-1',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      client_id: 'olist-client',
      client_secret: 'olist-secret',
      redirect_uri: credentials.redirectUri,
      code: 'code-1',
      code_verifier: 'verifier-1',
    });
    expect(tokens).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresInSeconds: 14_400,
      refreshExpiresInSeconds: 86_400,
    });
  });

  it('renova tokens e usa um dia quando refresh_expires_in está ausente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 14_400 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await olistOAuthProvider.refresh({ credentials, refreshToken: 'refresh-1' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toMatchObject({
      grant_type: 'refresh_token',
      client_id: 'olist-client',
      client_secret: 'olist-secret',
      refresh_token: 'refresh-1',
    });
    expect(tokens.refreshExpiresInSeconds).toBe(86_400);
  });

  it('recusa resposta JSON sem tokens obrigatórios', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'access' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      olistOAuthProvider.refresh({ credentials, refreshToken: 'refresh-1' }),
    ).rejects.toMatchObject({ code: 'olist_token_resposta_invalida', kind: 'permanent' });
  });

  it('aborta cada tentativa de token no timeout e retorna erro transitório seguro', async () => {
    vi.useFakeTimers();
    let aborts = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborts += 1;
            reject(new DOMException('aborted', 'AbortError'));
          },
          { once: true },
        );
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = olistOAuthProvider.refresh({ credentials, refreshToken: 'refresh-1' });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'olist_token_erro_transiente',
      kind: 'transient',
    });
    await vi.advanceTimersByTimeAsync(OLIST_TOKEN_REQUEST_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(OLIST_TOKEN_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aborts).toBe(2);
  });

  it.each([400, 401])('classifica HTTP %s como permanente e não repete', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('remote body', { status }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      olistOAuthProvider.refresh({ credentials, refreshToken: 'refresh-1' }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<OAuthProviderError>>({
        code: 'olist_token_erro_permanente',
        kind: 'permanent',
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['network', '429', '500'])(
    'repete uma vez a falha transitória %s e lança código seguro',
    async (kind) => {
      vi.useFakeTimers();
      const failure =
        kind === 'network'
          ? new TypeError('network')
          : new Response('remote body', {
              status: Number(kind),
              headers: kind === '429' ? { 'retry-after': '1' } : undefined,
            });
      const fetchMock = vi.fn();
      if (failure instanceof Response) fetchMock.mockResolvedValue(failure);
      else fetchMock.mockRejectedValue(failure);
      vi.stubGlobal('fetch', fetchMock);

      const promise = olistOAuthProvider.refresh({ credentials, refreshToken: 'refresh-1' });
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'olist_token_erro_transiente',
        kind: 'transient',
      });
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
});
