import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    BLING_CLIENT_ID: 'cli-123',
    BLING_CLIENT_SECRET: 'sec-123',
    BLING_REDIRECT_URI: 'http://localhost:3000/api/connections/bling/callback',
    BLING_API_BASE: 'https://www.bling.com.br/Api/v3',
  },
}));

describe('buildAuthorizeUrl', () => {
  it('monta a URL de autorização com os params certos quando configurado', async () => {
    const { buildAuthorizeUrl } = await import('@/modules/providers/bling/oauth');
    const url = new URL(buildAuthorizeUrl('xyz-state'));
    expect(url.pathname.endsWith('/oauth/authorize')).toBe(true);
    expect(url.searchParams.get('client_id')).toBe('cli-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('xyz-state');
    expect(url.searchParams.get('redirect_uri')).toContain('/api/connections/bling/callback');
  });
});

describe('refreshTokens — classificação de falha (permanente vs transitória)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function resposta(
    status: number,
    body: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Response {
    return new Response(JSON.stringify(body), { status, headers });
  }

  const TOKENS_OK = { access_token: 'acc-novo', refresh_token: 'rt-novo', expires_in: 21600 };

  it('400 (invalid_grant) → bling_refresh_invalido SEM retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta(400, { error: 'invalid_grant' }));
    vi.stubGlobal('fetch', fetchMock);
    const { refreshTokens } = await import('@/modules/providers/bling/oauth');
    await expect(refreshTokens('rt-x')).rejects.toThrow('bling_refresh_invalido');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 → bling_refresh_invalido SEM retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta(401));
    vi.stubGlobal('fetch', fetchMock);
    const { refreshTokens } = await import('@/modules/providers/bling/oauth');
    await expect(refreshTokens('rt-x')).rejects.toThrow('bling_refresh_invalido');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('503 seguido de 200 → retry curto recupera e devolve os tokens', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta(503))
      .mockResolvedValueOnce(resposta(200, TOKENS_OK));
    vi.stubGlobal('fetch', fetchMock);
    const { refreshTokens } = await import('@/modules/providers/bling/oauth');
    const promessa = refreshTokens('rt-x');
    await vi.advanceTimersByTimeAsync(1000);
    const tokens = await promessa;
    expect(tokens.accessToken).toBe('acc-novo');
    expect(tokens.refreshToken).toBe('rt-novo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('503 duas vezes → bling_refresh_transiente após 1 retry', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(resposta(503));
    vi.stubGlobal('fetch', fetchMock);
    const { refreshTokens } = await import('@/modules/providers/bling/oauth');
    const promessa = refreshTokens('rt-x');
    const asercao = expect(promessa).rejects.toThrow('bling_refresh_transiente');
    await vi.advanceTimersByTimeAsync(1000);
    await asercao;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 honra Retry-After no retry e recupera', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(resposta(200, TOKENS_OK));
    vi.stubGlobal('fetch', fetchMock);
    const { refreshTokens } = await import('@/modules/providers/bling/oauth');
    const promessa = refreshTokens('rt-x');
    // Antes do Retry-After (2s) o retry NÃO dispara
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    const tokens = await promessa;
    expect(tokens.accessToken).toBe('acc-novo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('erro de rede persistente → bling_refresh_transiente após 1 retry', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const { refreshTokens } = await import('@/modules/providers/bling/oauth');
    const promessa = refreshTokens('rt-x');
    const asercao = expect(promessa).rejects.toThrow('bling_refresh_transiente');
    await vi.advanceTimersByTimeAsync(1000);
    await asercao;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
