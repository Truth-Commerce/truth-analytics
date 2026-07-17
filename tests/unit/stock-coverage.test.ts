import { describe, expect, it } from 'vitest';

import { montarCobertura } from '@/modules/estoque/stock-coverage';

const vendas = (pares: [string, number][]) => new Map<string, number>(pares);

describe('montarCobertura', () => {
  it('classifica por cobertura em dias: critico <7, atencao <15, ok >=15', () => {
    const r = montarCobertura(
      [
        { sku: 'CRIT', nome: 'Crítico', saldo: 5 },   // 5 ÷ (30/30=1/dia) = 5d
        { sku: 'ATEN', nome: 'Atenção', saldo: 10 },  // 10 ÷ 1 = 10d
        { sku: 'OK', nome: 'Ok', saldo: 60 },          // 60 ÷ 1 = 60d
      ],
      vendas([
        ['CRIT', 30],
        ['ATEN', 30],
        ['OK', 30],
      ]),
    );
    const porSku = new Map(r.map((p) => [p.sku, p]));
    expect(porSku.get('CRIT')).toMatchObject({ coberturaDias: 5, estado: 'critico' });
    expect(porSku.get('ATEN')).toMatchObject({ coberturaDias: 10, estado: 'atencao' });
    expect(porSku.get('OK')).toMatchObject({ coberturaDias: 60, estado: 'ok' });
  });

  it('saldo zerado com venda recente = cobertura 0 = critico (vendendo sem estoque)', () => {
    const [p] = montarCobertura([{ sku: 'ZERO', nome: 'Zerado', saldo: 0 }], vendas([['ZERO', 15]]));
    expect(p).toMatchObject({ coberturaDias: 0, estado: 'critico' });
  });

  it('saldo>0 sem venda em 30d = parado (cobertura null)', () => {
    const [p] = montarCobertura([{ sku: 'PAR', nome: 'Parado', saldo: 8 }], vendas([]));
    expect(p).toMatchObject({ coberturaDias: null, estado: 'parado', vendas30d: 0 });
  });

  it('filtra mortos: saldo<=0 e zero venda somem da lista', () => {
    const r = montarCobertura([{ sku: 'MORTO', nome: 'Morto', saldo: 0 }], vendas([]));
    expect(r).toEqual([]);
  });

  it('ordena por prioridade de estado e, no empate, por vendas30d desc', () => {
    const r = montarCobertura(
      [
        { sku: 'OK1', nome: 'a', saldo: 300 },
        { sku: 'PAR', nome: 'b', saldo: 5 },
        { sku: 'CRIT-MENOR', nome: 'c', saldo: 2 },
        { sku: 'CRIT-MAIOR', nome: 'd', saldo: 3 },
      ],
      vendas([
        ['OK1', 30],
        ['CRIT-MENOR', 30],
        ['CRIT-MAIOR', 60],
      ]),
    );
    expect(r.map((p) => p.sku)).toEqual(['CRIT-MAIOR', 'CRIT-MENOR', 'OK1', 'PAR']);
  });

  it('cobertura arredonda para inteiro (floor)', () => {
    // 10 ÷ (7/30 por dia) = 42,857... → 42
    const [p] = montarCobertura([{ sku: 'F', nome: 'f', saldo: 10 }], vendas([['F', 7]]));
    expect(p!.coberturaDias).toBe(42);
    expect(p!.estado).toBe('ok');
  });
});
