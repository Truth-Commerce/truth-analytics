import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('token-teste'),
}));

import { fetchOrders } from '@/modules/providers/bling/orders';

function paginaVazia(): Response {
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
}

const PERIODO = { inicio: new Date('2026-06-01'), fim: new Date('2026-07-01') };

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

    const promise = fetchOrders('org-1', PERIODO);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual([]);
    expect(chamadasDePedidos(fetchMock)).toBe(2);
  });

  it('429 com Retry-After maior que o exponencial → honra o header (não refaz antes)', async () => {
    const fetchMock = mockDePedidos(
      new Response(null, { status: 429, headers: { 'retry-after': '5' } }),
      paginaVazia(),
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);

    // Se o header fosse ignorado, o fallback exponencial (1s) já teria refeito o fetch aos 2s.
    await vi.advanceTimersByTimeAsync(2000);
    expect(chamadasDePedidos(fetchMock)).toBe(1);

    // Honrando Retry-After: só refaz aos 5s.
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toEqual([]);
    expect(chamadasDePedidos(fetchMock)).toBe(2);
  });

  it('5xx → retry com backoff exponencial; sucesso na 2ª', async () => {
    const fetchMock = mockDePedidos(new Response(null, { status: 503 }), paginaVazia());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);
    await vi.advanceTimersByTimeAsync(1000); // fallback exponencial da 1ª tentativa
    await expect(promise).resolves.toEqual([]);
    expect(chamadasDePedidos(fetchMock)).toBe(2);
  });

  it('3× 429 → lança bling_erro_429', async () => {
    const fetchMock = mockDePedidos(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);
    const esperado = expect(promise).rejects.toThrow('bling_erro_429');
    await vi.advanceTimersByTimeAsync(1000 + 2000); // backoff 1s + 2s
    await esperado;
    expect(chamadasDePedidos(fetchMock)).toBe(3);
  });

  it('4xx ≠ 429 falha direto sem retry', async () => {
    const fetchMock = mockDePedidos(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOrders('org-1', PERIODO)).rejects.toThrow('bling_indisponivel');
    expect(chamadasDePedidos(fetchMock)).toBe(1);
  });

  it('onPage recebe cada página e o retorno não acumula', async () => {
    const pedido = { id: 1, data: '2026-06-10', total: 100 };
    const cheia = Array.from({ length: 100 }, (_, i) => ({ ...pedido, id: i + 1 }));
    const fetchMock = mockDePedidos(
      new Response(JSON.stringify({ data: cheia }), { status: 200 }),
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
