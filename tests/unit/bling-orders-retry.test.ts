import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('token-teste'),
}));

import { fetchOrders } from '@/modules/providers/bling/orders';

function paginaVazia(): Response {
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
}

const PERIODO = { inicio: new Date('2026-06-01'), fim: new Date('2026-07-01') };

describe('fetchOrders retry/backoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('429 com Retry-After → aguarda e refaz; sucesso na 2ª', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(paginaVazia());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 com Retry-After maior que o exponencial → honra o header (não refaz antes)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '5' } }),
      )
      .mockResolvedValueOnce(paginaVazia());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);

    // Se o header fosse ignorado, o fallback exponencial (1s) já teria refeito o fetch aos 2s.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Honrando Retry-After: só refaz aos 5s.
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('5xx → retry com backoff exponencial; sucesso na 2ª', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(paginaVazia());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);
    await vi.advanceTimersByTimeAsync(1000); // fallback exponencial da 1ª tentativa
    await expect(promise).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('3× 429 → lança bling_erro_429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);
    const esperado = expect(promise).rejects.toThrow('bling_erro_429');
    await vi.advanceTimersByTimeAsync(1000 + 2000); // backoff 1s + 2s
    await esperado;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('4xx ≠ 429 falha direto sem retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOrders('org-1', PERIODO)).rejects.toThrow('bling_indisponivel');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('onPage recebe cada página e o retorno não acumula', async () => {
    const pedido = { id: 1, data: '2026-06-10', total: 100, itens: [] };
    const cheia = Array.from({ length: 100 }, (_, i) => ({ ...pedido, id: i + 1 }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: cheia }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ ...pedido, id: 999 }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const paginas: number[] = [];
    const retorno = await fetchOrders('org-1', PERIODO, async (pagina) => {
      paginas.push(pagina.length);
    });
    expect(paginas).toEqual([100, 1]);
    expect(retorno).toEqual([]);
  });
});
