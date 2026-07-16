import { describe, expect, it } from 'vitest';

import {
  categoriaDoCanal,
  coresDosCanais,
  corDoCanal,
  CORES_CANAL,
} from '@/lib/canal-visual';

describe('categoriaDoCanal', () => {
  it('reconhece Shopee em qualquer grafia', () => {
    expect(categoriaDoCanal('Shopee')).toBe('shopee');
    expect(categoriaDoCanal('SHOPEE - Loja Oficial')).toBe('shopee');
  });

  it('reconhece Mercado Livre nas variações comuns', () => {
    expect(categoriaDoCanal('Mercado Livre')).toBe('mercado_livre');
    expect(categoriaDoCanal('MercadoLivre')).toBe('mercado_livre');
    expect(categoriaDoCanal('Mercado Libre')).toBe('mercado_livre');
  });

  it('classifica plataformas de loja virtual como loja_virtual', () => {
    expect(categoriaDoCanal('Nuvemshop')).toBe('loja_virtual');
    expect(categoriaDoCanal('Tray')).toBe('loja_virtual');
    expect(categoriaDoCanal('Loja Integrada')).toBe('loja_virtual');
    expect(categoriaDoCanal('Site próprio')).toBe('loja_virtual');
    expect(categoriaDoCanal('E-commerce')).toBe('loja_virtual');
  });

  it('ignora acentos e caixa', () => {
    expect(categoriaDoCanal('SÍTE')).toBe('loja_virtual');
  });

  it('canal desconhecido cai em outro', () => {
    expect(categoriaDoCanal('Bling')).toBe('outro');
    expect(categoriaDoCanal('Magalu')).toBe('outro');
    expect(categoriaDoCanal('')).toBe('outro');
  });
});

describe('corDoCanal', () => {
  it('devolve a cor-base da categoria (spec H0)', () => {
    expect(corDoCanal('Shopee')).toBe('#EE4D2D');
    expect(corDoCanal('Mercado Livre')).toBe('#FFE600');
    expect(corDoCanal('Nuvemshop')).toBe('#3B82F6');
    expect(corDoCanal('Bling')).toBe('#94A3B8');
  });
});

describe('coresDosCanais', () => {
  it('atribui a cor-base de cada categoria na ordem da série', () => {
    expect(coresDosCanais(['Shopee', 'Mercado Livre', 'Nuvemshop'])).toEqual([
      '#EE4D2D',
      '#FFE600',
      '#3B82F6',
    ]);
  });

  it('repetições da mesma categoria avançam o tom para não colidir', () => {
    const [nuvem, tray] = coresDosCanais(['Nuvemshop', 'Tray']);
    expect(nuvem).toBe('#3B82F6');
    expect(tray).toBe(CORES_CANAL.loja_virtual[1]);
    expect(tray).not.toBe(nuvem);
  });

  it('mais repetições que tons cicla o array de tons', () => {
    const tons = CORES_CANAL.outro;
    const cores = coresDosCanais(['A', 'B', 'C', 'D']);
    expect(cores[3]).toBe(tons[3 % tons.length]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(coresDosCanais([])).toEqual([]);
  });
});
