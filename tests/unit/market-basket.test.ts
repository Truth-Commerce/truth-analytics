import { describe, expect, it } from 'vitest';

import { candidatosDeKits, MAX_CANDIDATOS } from '@/modules/kits/market-basket';

const pedido = (...skus: string[]) => ({
  itens: skus.map((s) => ({ sku: s, nome: `Nome ${s}`, quantidade: 1 })),
});

describe('candidatosDeKits', () => {
  it('conta pares co-ocorrentes por pedido e aplica suporte mínimo 2', () => {
    const r = candidatosDeKits([pedido('A', 'B'), pedido('A', 'B', 'C'), pedido('B', 'C')]);
    // A+B em 2 pedidos (passa); B+C em 2 (passa); A+C em 1 (corta).
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ skus: ['A', 'B'], nomes: ['Nome A', 'Nome B'], pedidosJuntos: 2 });
    expect(r.map((c) => c.skus.join('+'))).toEqual(['A+B', 'B+C']);
  });

  it('par é canônico (ordem alfabética) independente da ordem no pedido', () => {
    const r = candidatosDeKits([pedido('Z', 'A'), pedido('A', 'Z')]);
    expect(r[0]!.skus).toEqual(['A', 'Z']);
  });

  it('ignora itens sem sku e pedidos com < 2 skus distintos', () => {
    const r = candidatosDeKits([
      { itens: [{ nome: 'sem sku', quantidade: 3 }, { sku: 'A', nome: 'A', quantidade: 1 }] },
      pedido('A'),
      pedido('A', 'A'),
    ]);
    expect(r).toEqual([]);
  });

  it('mesmo par 2x no MESMO pedido conta 1 (pedidos, não quantidades)', () => {
    const r = candidatosDeKits([
      { itens: [
        { sku: 'A', nome: 'A', quantidade: 5 },
        { sku: 'B', nome: 'B', quantidade: 9 },
      ] },
      pedido('A', 'B'),
    ]);
    expect(r[0]!.pedidosJuntos).toBe(2);
  });

  it('ordena por pedidosJuntos desc e corta em MAX_CANDIDATOS', () => {
    const pedidos = [];
    // Par X+Y aparece 5x; 10 outros pares aparecem 2x cada.
    for (let i = 0; i < 5; i++) pedidos.push(pedido('X', 'Y'));
    for (let p = 0; p < 10; p++) for (let i = 0; i < 2; i++) pedidos.push(pedido(`P${p}a`, `P${p}b`));
    const r = candidatosDeKits(pedidos);
    expect(r[0]!.skus).toEqual(['X', 'Y']);
    expect(r).toHaveLength(MAX_CANDIDATOS);
  });
});
