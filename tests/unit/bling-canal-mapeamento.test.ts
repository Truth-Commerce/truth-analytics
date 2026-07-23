import { describe, expect, it } from 'vitest';

import { mapOrder } from '@/modules/providers/bling/orders';

const CANAIS = new Map([
  ['205976832', 'Shopee'],
  ['205991788', 'Mercado Livre'],
]);

/**
 * Regressão do bug que rotulou 694 de 694 pedidos como "Bling": o código lia
 * `canal.descricao`, campo que NÃO existe no payload de /pedidos/vendas. O canal
 * real vem de `loja.id`, resolvido contra /canais-venda.
 */
describe('mapOrder — canal a partir de loja.id', () => {
  it('resolve o nome do marketplace pelo loja.id', () => {
    const pedido = mapOrder(
      { id: 26409406052, data: '2026-07-23', total: 10.9, loja: { id: 205976832 } },
      CANAIS,
    );
    expect(pedido.canal).toBe('Shopee');
  });

  it('resolve loja.id vindo como string (o Bling alterna number/string)', () => {
    const pedido = mapOrder({ id: 1, data: '2026-07-23', loja: { id: '205991788' } }, CANAIS);
    expect(pedido.canal).toBe('Mercado Livre');
  });

  it('loja.id desconhecido cai no fallback, sem inventar nome', () => {
    const pedido = mapOrder({ id: 1, data: '2026-07-23', loja: { id: 999 } }, CANAIS);
    expect(pedido.canal).toBe('Bling');
  });

  it('sem loja no payload cai no fallback', () => {
    const pedido = mapOrder({ id: 1, data: '2026-07-23' }, CANAIS);
    expect(pedido.canal).toBe('Bling');
  });

  it('mapa vazio (canais-venda indisponivel) nao quebra a coleta', () => {
    const pedido = mapOrder({ id: 1, data: '2026-07-23', loja: { id: 205976832 } }, new Map());
    expect(pedido.canal).toBe('Bling');
  });

  it('nunca estoura os 32 chars da coluna canal', () => {
    const longo = new Map([['7', 'Canal Com Nome Absurdamente Longo Que Nao Cabe']]);
    const pedido = mapOrder({ id: 1, data: '2026-07-23', loja: { id: 7 } }, longo);
    expect(pedido.canal.length).toBeLessThanOrEqual(32);
  });

  it('usa `numero` como id quando `id` falta (payload real tem os dois)', () => {
    const pedido = mapOrder({ numero: 3549, data: '2026-07-23' }, CANAIS);
    expect(pedido.blingOrderId).toBe('3549');
  });

  it('itens e frete saem vazios da listagem — quem preenche e o enriquecimento', () => {
    const pedido = mapOrder({ id: 1, data: '2026-07-23', total: 10.9, loja: { id: 205976832 } }, CANAIS);
    expect(pedido.itens).toEqual([]);
    expect(pedido.frete).toBe(0);
  });
});
