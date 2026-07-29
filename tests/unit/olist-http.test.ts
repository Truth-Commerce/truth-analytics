import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { getFingerprint, getToken, renew, reserve, observe } = vi.hoisted(() => ({
  getFingerprint: vi.fn(),
  getToken: vi.fn(),
  renew: vi.fn(),
  reserve: vi.fn(),
  observe: vi.fn(),
}));

vi.mock('@/modules/connections/provider-connection.repository', () => ({
  getOlistAccountFingerprint: getFingerprint,
  getValidAccessTokenForProvider: getToken,
}));
vi.mock('@/modules/connections/olist-token-renewal', () => ({ renewOlistConnection: renew }));
vi.mock('@/modules/providers/olist/rate-governor.repository', () => ({
  reserveOlistRequest: reserve,
  observeOlistRateHeaders: observe,
}));

import { fetchOlistJson, WORST_CASE_OLIST_REQUEST_MS } from '@/modules/providers/olist/http';

const schema = z.object({ ok: z.literal(true) });
const input = { orgId: 'org-a', priority: 'orders' as const, path: '/orders', schema };

afterEach(() => {
  getFingerprint.mockReset();
  getToken.mockReset();
  renew.mockReset();
  reserve.mockReset();
  observe.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Olist HTTP deadline', () => {
  it('expõe um orçamento absoluto de sessenta segundos', () => {
    expect(WORST_CASE_OLIST_REQUEST_MS).toBe(60_000);
  });

  it.each(['/../evil', '/%2f%2fattacker', '/orders\\evil', '/orders\n'])('rejeita path inseguro antes de autenticar: %s', async (path) => {
    await expect(fetchOlistJson({ ...input, path })).rejects.toMatchObject({ code: 'olist_path_invalid' });
    expect(getFingerprint).not.toHaveBeenCalled();
  });

  it('preserva o prefixo oficial e só envia Bearer ao origin permitido', async () => {
    getFingerprint.mockResolvedValue('f'.repeat(64));
    getToken.mockResolvedValue('token-a');
    reserve.mockResolvedValue({ startAt: new Date() });
    observe.mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOlistJson({ ...input, path: '/orders', query: { page: '1' } })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://api.tiny.com.br/public-api/v3/orders?page=1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-a');
  });

  it('reserva novamente e faz no máximo dois requests após 401', async () => {
    getFingerprint.mockResolvedValue('f'.repeat(64));
    getToken.mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    reserve.mockResolvedValue({ startAt: new Date() });
    renew.mockResolvedValue('renewed');
    observe.mockResolvedValue(undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOlistJson(input)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(renew).toHaveBeenCalledWith('org-a', expect.any(Date), expect.objectContaining({ force: true }));
  });

  it.each([
    [new TypeError('network'), undefined],
    [new Response(null, { status: 429, headers: { 'retry-after': '0' } }), 429],
  ])('repete uma falha transitória com uma nova reserva: %s', async (failure) => {
    getFingerprint.mockResolvedValue('f'.repeat(64));
    getToken.mockResolvedValue('token-a');
    reserve.mockResolvedValue({ startAt: new Date() });
    observe.mockResolvedValue(undefined);
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => failure instanceof Error ? Promise.reject(failure) : Promise.resolve(failure))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOlistJson(input)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reserve).toHaveBeenCalledTimes(2);
  });
});
