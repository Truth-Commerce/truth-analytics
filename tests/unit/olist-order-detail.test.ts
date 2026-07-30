import { afterEach, describe, expect, it, vi } from 'vitest';
import detailFixture from '../fixtures/olist/order-detail.json';

const { fetchJson, MockOlistDataError } = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  MockOlistDataError: class extends Error {
    constructor(public readonly code: string, public readonly kind: string, public readonly status?: number) { super(code); }
  },
}));
vi.mock('@/modules/providers/olist/http', () => ({ fetchOlistJson: fetchJson, OlistDataError: MockOlistDataError }));

import { fetchOlistOrderDetail } from '@/modules/providers/olist/order-detail';

afterEach(() => fetchJson.mockReset());

describe('fetchOlistOrderDetail', () => {
  it('mapeia somente campos oficiais necessarios, com comissao zero', async () => {
    fetchJson.mockResolvedValue(detailFixture);
    await expect(fetchOlistOrderDetail('org-1', '6201')).resolves.toEqual({
      itens: [{ sku: 'SKU-1', nome: 'Produto 1', quantidade: 2, valor: 49.95 }], frete: 10, comissao: 0, canal: 'Mercado Livre',
    });
  });

  it('escapa o identificador remoto no path', async () => {
    fetchJson.mockResolvedValue(detailFixture);
    await fetchOlistOrderDetail('org-1', 'a/b');
    expect(fetchJson).toHaveBeenCalledWith(expect.objectContaining({ path: '/pedidos/a%2Fb' }));
  });

  it.each([
    [{ ...detailFixture, itens: [{ ...detailFixture.itens[0], produto: { id: 1, descricao: 'Sem SKU' } }] }],
    [{ ...detailFixture, itens: [{ ...detailFixture.itens[0], quantidade: 'x' }] }],
    [{ ...detailFixture, valorFrete: 'gratis' }],
  ])('rejeita campos de detalhe usados invalidos', async (payload) => {
    fetchJson.mockResolvedValue(payload);
    await expect(fetchOlistOrderDetail('org-1', '6201')).rejects.toThrow('olist_detalhe_resposta_invalida');
  });

  it('converte falha de schema do cliente HTTP para o codigo especifico de detalhe', async () => {
    fetchJson.mockRejectedValue(new MockOlistDataError('olist_payload_invalido', 'permanent', 200));
    await expect(fetchOlistOrderDetail('org-1', '6201')).rejects.toThrow('olist_detalhe_resposta_invalida');
  });
});
