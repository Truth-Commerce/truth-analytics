import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks das dependências externas (db, token, Bling) ---
// vi.mock é içado ao topo do arquivo; o mock precisa existir nesse momento, por
// isso vai por vi.hoisted em vez de uma const comum (que ainda não foi avaliada).
const { dbMock, updates } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), update: vi.fn() },
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/db/client', () => ({ db: dbMock }));
vi.mock('@/db/schema', () => ({
  orders: {
    id: 'id',
    org_id: 'org_id',
    data: 'data',
    bling_order_id: 'bling_order_id',
    enriquecido_em: 'enriquecido_em',
  },
}));
vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('token-teste'),
}));
const { fetchCanaisVenda } = vi.hoisted(() => ({ fetchCanaisVenda: vi.fn() }));
vi.mock('@/modules/providers/bling/canais', () => ({
  CANAL_DESCONHECIDO: 'Bling',
  fetchCanaisVenda: (...a: unknown[]) => fetchCanaisVenda(...a),
}));

const { fetchOrderDetail } = vi.hoisted(() => ({ fetchOrderDetail: vi.fn() }));
vi.mock('@/modules/providers/bling/order-detail', () => ({
  fetchOrderDetail: (...a: unknown[]) => fetchOrderDetail(...a),
}));

import { enrichOrders } from '@/modules/pipeline/steps/enrich-orders';

/** Encadeia o `db.select()...limit()` para devolver a fila e o `db.update()` para capturar. */
function armarDb(pendentes: Array<{ id: string; blingOrderId: string }>, restantesDepois: number) {
  let selectChamadas = 0;
  dbMock.select.mockImplementation((cols?: Record<string, unknown>) => {
    // 1ª forma: SELECT de colunas (fila). 2ª: count(*) (restantes).
    const ehContagem = cols && 'n' in cols;
    return {
      from: () => ({
        where: (..._w: unknown[]) => {
          if (ehContagem) return Promise.resolve([{ n: restantesDepois }]);
          return {
            orderBy: () => ({
              limit: () => {
                selectChamadas++;
                return Promise.resolve(pendentes);
              },
            }),
          };
        },
      }),
    };
  });

  dbMock.update.mockImplementation(() => ({
    set: (valores: Record<string, unknown>) => ({
      where: () => {
        updates.push(valores);
        return Promise.resolve([]);
      },
    }),
  }));

  return () => selectChamadas;
}

describe('enrichOrders', () => {
  beforeEach(() => {
    updates.length = 0;
    vi.clearAllMocks();
    // Reafirma após clearAllMocks: por padrão a org tem o canal Shopee mapeado.
    fetchCanaisVenda.mockResolvedValue(new Map([['205976832', 'Shopee']]));
  });

  it('grava itens, frete e comissao de cada pendente', async () => {
    armarDb(
      [
        { id: 'u1', blingOrderId: '100' },
        { id: 'u2', blingOrderId: '200' },
      ],
      0,
    );
    fetchOrderDetail.mockResolvedValue({
      itens: [{ sku: 'A', nome: 'X', quantidade: 1, valor: 9.9 }],
      frete: 12.5,
      comissao: 6.18,
      canalId: '205976832',
    });

    const r = await enrichOrders('org-1', { maxPedidos: 50, prazoMs: 60_000 });

    expect(r.enriquecidos).toBe(2);
    expect(r.falhas).toBe(0);
    expect(r.incompleto).toBe(false);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ frete: '12.5', comissao: '6.18', canal: 'Shopee' });
    expect(updates[0].enriquecido_em).toBeInstanceOf(Date);
  });

  it('falha de um pedido nao contamina os outros', async () => {
    armarDb(
      [
        { id: 'u1', blingOrderId: '100' },
        { id: 'u2', blingOrderId: '200' },
      ],
      0,
    );
    fetchOrderDetail
      .mockRejectedValueOnce(new Error('bling_erro_500'))
      .mockResolvedValueOnce({ itens: [], frete: 0, comissao: 0, canalId: undefined });

    const r = await enrichOrders('org-1', { maxPedidos: 50, prazoMs: 60_000 });

    expect(r.enriquecidos).toBe(1);
    expect(r.falhas).toBe(1);
    expect(updates).toHaveLength(1);
  });

  it('fila vazia retorna cedo sem chamar o Bling', async () => {
    armarDb([], 0);
    const r = await enrichOrders('org-1', { maxPedidos: 50, prazoMs: 60_000 });
    expect(r.enriquecidos).toBe(0);
    expect(fetchOrderDetail).not.toHaveBeenCalled();
  });

  it('sinaliza incompleto quando ainda restam pendentes', async () => {
    armarDb([{ id: 'u1', blingOrderId: '100' }], 130);
    fetchOrderDetail.mockResolvedValue({ itens: [], frete: 0, comissao: 0, canalId: undefined });

    const r = await enrichOrders('org-1', { maxPedidos: 1, prazoMs: 60_000 });

    expect(r.restantes).toBe(130);
    expect(r.incompleto).toBe(true);
  });

  it('canal desconhecido no detalhe nao rebaixa o canal ja gravado', async () => {
    armarDb([{ id: 'u1', blingOrderId: '100' }], 0);
    fetchOrderDetail.mockResolvedValue({
      itens: [],
      frete: 0,
      comissao: 0,
      canalId: '999', // nao esta no mapa
    });

    await enrichOrders('org-1', { maxPedidos: 50, prazoMs: 60_000 });

    expect(updates[0]).not.toHaveProperty('canal');
  });
});
