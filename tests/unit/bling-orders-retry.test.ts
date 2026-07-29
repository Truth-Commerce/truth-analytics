import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('token-teste'),
}));

import { fetchOrders, mapOrder } from '@/modules/providers/bling/orders';

function paginaVazia(): Response {
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
}

const PERIODO = { inicio: new Date('2026-06-01'), fim: new Date('2026-07-01') };
const CREATED_REQUEST = { mode: 'created' as const, periodo: PERIODO, offset: 0, limit: 100 as const };
const UPDATED_REQUEST = {
  mode: 'updated' as const,
  updatedAfter: new Date('2026-06-10T14:30:00.000Z'),
  offset: 0,
  limit: 100 as const,
};

/**
 * fetchOrders resolve o nome do canal antes de paginar (1 requisição a
 * /canais-venda). Este wrapper responde essa chamada com uma lista vazia e
 * entrega as respostas roteadas apenas para /pedidos/vendas — assim as asserções
 * de retry continuam contando só o que interessa.
 */
function mockDePedidos(...respostas: Response[]) {
  let i = 0;
  return vi.fn((url: string | URL) => {
    if (String(url).includes('/canais-venda')) {
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    }
    const res = respostas[Math.min(i, respostas.length - 1)];
    i++;
    return Promise.resolve(res.clone());
  });
}

/** Só as chamadas a /pedidos/vendas (ignora o lookup de canais). */
function chamadasDePedidos(mock: ReturnType<typeof mockDePedidos>): number {
  return mock.mock.calls.filter((c) => !String(c[0]).includes('/canais-venda')).length;
}

describe('fetchOrders retry/backoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('429 com Retry-After → aguarda e refaz; sucesso na 2ª', async () => {
    const fetchMock = mockDePedidos(
      new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      paginaVazia(),
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', CREATED_REQUEST, async () => {});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBeUndefined();
    expect(chamadasDePedidos(fetchMock)).toBe(2);
  });

  it('429 com Retry-After maior que o exponencial → honra o header (não refaz antes)', async () => {
    const fetchMock = mockDePedidos(
      new Response(null, { status: 429, headers: { 'retry-after': '5' } }),
      paginaVazia(),
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', CREATED_REQUEST, async () => {});

    // Se o header fosse ignorado, o fallback exponencial (1s) já teria refeito o fetch aos 2s.
    await vi.advanceTimersByTimeAsync(2000);
    expect(chamadasDePedidos(fetchMock)).toBe(1);

    // Honrando Retry-After: só refaz aos 5s.
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toBeUndefined();
    expect(chamadasDePedidos(fetchMock)).toBe(2);
  });

  it('5xx → retry com backoff exponencial; sucesso na 2ª', async () => {
    const fetchMock = mockDePedidos(new Response(null, { status: 503 }), paginaVazia());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', CREATED_REQUEST, async () => {});
    await vi.advanceTimersByTimeAsync(1000); // fallback exponencial da 1ª tentativa
    await expect(promise).resolves.toBeUndefined();
    expect(chamadasDePedidos(fetchMock)).toBe(2);
  });

  it('3× 429 → lança bling_erro_429', async () => {
    const fetchMock = mockDePedidos(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', CREATED_REQUEST, async () => {});
    const esperado = expect(promise).rejects.toThrow('bling_erro_429');
    await vi.advanceTimersByTimeAsync(1000 + 2000); // backoff 1s + 2s
    await esperado;
    expect(chamadasDePedidos(fetchMock)).toBe(3);
  });

  it('4xx ≠ 429 falha direto sem retry', async () => {
    const fetchMock = mockDePedidos(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOrders('org-1', CREATED_REQUEST, async () => {})).rejects.toThrow('bling_indisponivel');
    expect(chamadasDePedidos(fetchMock)).toBe(1);
  });

  it('onPage recebe páginas com offsets provider-neutral', async () => {
    const pedido = { id: 1, data: '2026-06-10', total: 100 };
    const cheia = Array.from({ length: 100 }, (_, i) => ({ ...pedido, id: i + 1 }));
    const fetchMock = mockDePedidos(
      new Response(JSON.stringify({ data: cheia }), { status: 200 }),
      new Response(JSON.stringify({ data: [{ ...pedido, id: 999 }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const paginas: Array<{ offset: number; nextOffset: number; total: number; done: boolean; count: number }> = [];
    await fetchOrders('org-1', CREATED_REQUEST, async (pagina) => {
      paginas.push({
        offset: pagina.offset,
        nextOffset: pagina.nextOffset,
        total: pagina.total,
        done: pagina.done,
        count: pagina.orders.length,
      });
    });
    expect(paginas).toEqual([
      { offset: 0, nextOffset: 100, total: 100, done: false, count: 100 },
      { offset: 100, nextOffset: 200, total: 101, done: true, count: 1 },
    ]);
  });

  it('emite uma página terminal vazia quando a primeira página não tem pedidos', async () => {
    const fetchMock = mockDePedidos(paginaVazia());
    vi.stubGlobal('fetch', fetchMock);
    const paginas: Array<{ offset: number; nextOffset: number; total: number; done: boolean; count: number }> = [];

    await fetchOrders('org-1', CREATED_REQUEST, async (pagina) => {
      paginas.push({
        offset: pagina.offset,
        nextOffset: pagina.nextOffset,
        total: pagina.total,
        done: pagina.done,
        count: pagina.orders.length,
      });
    });

    expect(paginas).toEqual([
      { offset: 0, nextOffset: 0, total: 0, done: true, count: 0 },
    ]);
  });

  it('emite página terminal vazia após um total múltiplo de 100 sem duplicar pedidos', async () => {
    const cheia = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, data: '2026-06-10', total: 100 }));
    const fetchMock = mockDePedidos(
      new Response(JSON.stringify({ data: cheia }), { status: 200 }),
      paginaVazia(),
    );
    vi.stubGlobal('fetch', fetchMock);
    const paginas: Array<{ offset: number; nextOffset: number; total: number; done: boolean; ids: string[] }> = [];

    await fetchOrders('org-1', CREATED_REQUEST, async (pagina) => {
      paginas.push({
        offset: pagina.offset,
        nextOffset: pagina.nextOffset,
        total: pagina.total,
        done: pagina.done,
        ids: pagina.orders.map((order) => order.providerOrderId),
      });
    });

    expect(paginas).toEqual([
      { offset: 0, nextOffset: 100, total: 100, done: false, ids: Array.from({ length: 100 }, (_, i) => String(i + 1)) },
      { offset: 100, nextOffset: 100, total: 100, done: true, ids: [] },
    ]);
  });

  it('usa a janela documentada de alteração para o modo updated', async () => {
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
    const fetchMock = mockDePedidos(paginaVazia());
    vi.stubGlobal('fetch', fetchMock);

    await fetchOrders('org-1', UPDATED_REQUEST, async () => {});

    const requestUrl = new URL(String(fetchMock.mock.calls.find((call) => String(call[0]).includes('/pedidos/vendas'))?.[0]));
    expect(requestUrl.searchParams.get('dataAlteracaoInicial')).toBe('2026-06-10');
    expect(requestUrl.searchParams.get('dataAlteracaoFinal')).toBe('2026-07-29');
    expect(requestUrl.searchParams.has('dataAlteracao')).toBe(false);
  });

  it('normaliza o pedido para a identidade provider-neutral', () => {
    expect(mapOrder({ id: 17, data: '2026-07-29', total: 50 }, new Map())).toMatchObject({
      providerOrderId: '17',
      providerStatus: '',
    });
  });
});
