import { afterEach, describe, expect, it, vi } from 'vitest';
import pageFixture from '../fixtures/olist/orders-page.json';

const { fetchJson, MockOlistDataError } = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  MockOlistDataError: class extends Error {
    constructor(public readonly code: string, public readonly kind: string, public readonly status?: number) { super(code); }
  },
}));
vi.mock('@/modules/providers/olist/http', () => ({ fetchOlistJson: fetchJson, OlistDataError: MockOlistDataError }));

import { fetchOlistOrders } from '@/modules/providers/olist/orders';

afterEach(() => fetchJson.mockReset());

describe('fetchOlistOrders', () => {
  it('mapeia uma pagina oficial e preserva a continuacao', async () => {
    fetchJson.mockResolvedValue(pageFixture);
    const pages: unknown[] = [];
    await fetchOlistOrders('org-1', { mode: 'created', periodo: { inicio: new Date('2026-07-01'), fim: new Date('2026-07-31') }, offset: 0, limit: 100 }, async page => { pages.push(page); });
    const page = pages[0] as { orders: Array<Record<string, unknown>>; offset: number; nextOffset: number; total: number; done: boolean };
    expect(page.orders[0]).toMatchObject({ providerOrderId: '6201', providerStatus: '3', canal: 'Mercado Livre', valorTotal: 199.9 });
    expect(page).toMatchObject({ offset: 0, nextOffset: 2, total: 3, done: false });
    expect(page.orders[0]?.data).toEqual(new Date('2026-07-01T10:30:00.000Z'));
  });

  it('filtra catch-up somente por dataAtualizacao e conserva cancelamento tardio', async () => {
    fetchJson.mockResolvedValue({ itens: [{ ...pageFixture.itens[0], dataCriacao: '2026-04-01T00:00:00.000Z', situacao: 2 }], paginacao: { limit: 100, offset: 0, total: 1 } });
    const pages: Array<{ orders: Array<{ providerStatus: string }> }> = [];
    await fetchOlistOrders('org-1', { mode: 'updated', updatedAfter: new Date('2026-07-29T15:04:05.000Z'), offset: 0, limit: 100 }, async page => { pages.push(page); });
    expect(pages[0]?.orders[0]?.providerStatus).toBe('2');
    expect(fetchJson).toHaveBeenCalledWith(expect.objectContaining({ query: { dataAtualizacao: '2026-07-29 15:04:05', orderBy: 'asc', limit: '100', offset: '0' } }));
  });

  it.each([
    [{ itens: [{ ...pageFixture.itens[0], id: undefined }], paginacao: pageFixture.paginacao }],
    [{ itens: [{ ...pageFixture.itens[0], dataCriacao: 'nao-e-data' }], paginacao: pageFixture.paginacao }],
    [{ itens: [{ ...pageFixture.itens[0], dataCriacao: '0' }], paginacao: pageFixture.paginacao }],
    [{ itens: [{ ...pageFixture.itens[0], dataCriacao: '2026-02-30T00:00:00Z' }], paginacao: pageFixture.paginacao }],
    [{ itens: [{ ...pageFixture.itens[0], valor: 'infinito' }], paginacao: pageFixture.paginacao }],
    [{ itens: pageFixture.itens, paginacao: { limit: 2, offset: 0 } }],
  ])('rejeita campos usados invalidos em vez de gravar valores corrompidos', async (payload) => {
    fetchJson.mockResolvedValue(payload);
    await expect(fetchOlistOrders('org-1', { mode: 'created', periodo: { inicio: new Date(), fim: new Date() }, offset: 0, limit: 100 }, async () => undefined)).rejects.toThrow('olist_pedidos_resposta_invalida');
  });

  it('converte falha de schema do cliente HTTP para o codigo especifico de pedidos', async () => {
    fetchJson.mockRejectedValue(new MockOlistDataError('olist_payload_invalido', 'permanent', 200));
    await expect(fetchOlistOrders('org-1', { mode: 'created', periodo: { inicio: new Date(), fim: new Date() }, offset: 0, limit: 100 }, async () => undefined)).rejects.toThrow('olist_pedidos_resposta_invalida');
  });
});
