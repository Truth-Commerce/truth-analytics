import { describe, expect, it } from 'vitest';

import {
  agruparPorMes, chaveMes, filtrarUltimosMeses, inicioJanela,
  mesesJanela, porCanalMensal, topSkus, type PedidoRow,
} from '@/modules/desempenho/desempenho-anual';

const AGORA = new Date('2026-08-05T15:00:00Z');
const row = (over: Partial<PedidoRow>): PedidoRow => ({
  data: new Date('2026-08-01T12:00:00Z'), valor_total: '100.00', frete: '10.00',
  comissao: '15.00', canal: 'shopee', itens: [], ...over,
});

describe('desempenho-anual (puro)', () => {
  it('chaveMes usa fuso de Sao Paulo', () => {
    // 01:00 UTC do dia 1º = 22:00 SP do dia anterior → mês anterior
    expect(chaveMes(new Date('2026-08-01T01:00:00Z'))).toBe('2026-07');
    expect(chaveMes(new Date('2026-08-01T12:00:00Z'))).toBe('2026-08');
  });

  it('mesesJanela devolve 12 chaves cronológicas terminando no mês corrente', () => {
    const meses = mesesJanela(AGORA, 12);
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe('2025-09');
    expect(meses[11]).toBe('2026-08');
  });

  it('inicioJanela é o 1º instante SP do mês mais antigo', () => {
    expect(inicioJanela(AGORA, 12).toISOString()).toBe('2025-09-01T03:00:00.000Z');
  });

  it('agruparPorMes zera meses sem venda e calcula receita líquida', () => {
    const rows = [
      row({ data: new Date('2026-08-02T12:00:00Z'), valor_total: '100.00', frete: '10.00', comissao: '15.00' }),
      row({ data: new Date('2026-08-03T12:00:00Z'), valor_total: '50.00', frete: '0.00', comissao: '5.00' }),
      row({ data: new Date('2025-10-10T12:00:00Z'), valor_total: '200.00', frete: '20.00', comissao: '30.00' }),
    ];
    const meses = agruparPorMes(rows, AGORA, 12);
    expect(meses).toHaveLength(12);
    const ago = meses.find((m) => m.mes === '2026-08')!;
    expect(ago).toMatchObject({ faturamento: 150, pedidos: 2, ticketMedio: 75, frete: 10, comissao: 20, receitaLiquida: 120 });
    expect(meses.find((m) => m.mes === '2025-11')).toMatchObject({ faturamento: 0, pedidos: 0, ticketMedio: 0 });
  });

  it('agruparPorMes soma unidades dos itens', () => {
    const rows = [row({ itens: [{ sku: 'A', nome: 'A', quantidade: 2, valor: 10 }, { sku: 'B', nome: 'B', quantidade: 3, valor: 5 }] })];
    expect(agruparPorMes(rows, AGORA, 12).find((m) => m.mes === '2026-08')!.unidades).toBe(5);
  });

  it('porCanalMensal empilha faturamento por canal', () => {
    const rows = [
      row({ canal: 'shopee', valor_total: '100.00' }),
      row({ canal: 'mercado livre', valor_total: '40.00' }),
    ];
    const meses = porCanalMensal(rows, AGORA, 12);
    expect(meses).toHaveLength(12);
    expect(meses[11]).toEqual({ mes: '2026-08', canais: { shopee: 100, 'mercado livre': 40 } });
  });

  it('topSkus agrega por sku, ordena por quantidade e respeita o limite', () => {
    const rows = [
      row({ itens: [{ sku: 'A', nome: 'Produto A', quantidade: 1, valor: 10 }] }),
      row({ itens: [{ sku: 'B', nome: 'Produto B', quantidade: 5, valor: 2 }, { sku: 'A', nome: 'Produto A', quantidade: 2, valor: 10 }] }),
    ];
    const top = topSkus(rows, 1);
    expect(top).toEqual([{ sku: 'B', nome: 'Produto B', quantidade: 5, receita: 10 }]);
  });

  it('topSkus usa nome como fallback quando sku falta', () => {
    const rows = [row({ itens: [{ nome: 'Sem SKU', quantidade: 1, valor: 7 }] })];
    expect(topSkus(rows, 10)[0]).toMatchObject({ sku: 'Sem SKU', nome: 'Sem SKU', receita: 7 });
  });

  it('filtrarUltimosMeses corta pelo início da janela', () => {
    const dentro = row({ data: new Date('2026-06-15T12:00:00Z') });
    const fora = row({ data: new Date('2026-04-30T12:00:00Z') });
    expect(filtrarUltimosMeses([dentro, fora], AGORA, 3)).toEqual([dentro]);
  });
});
