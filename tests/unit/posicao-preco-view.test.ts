import { describe, expect, it } from 'vitest';

import { corDeltaPreco, deltaReceitaPorSku, fonteLabel, posicaoPrecoView } from '@/modules/reports/report-view-model';

describe('corDeltaPreco', () => {
  it('acima do mercado (>0) = ruim (vermelho); abaixo ou igual = boa (verde)', () => {
    expect(corDeltaPreco(10)).toBe('ruim');
    expect(corDeltaPreco(0.1)).toBe('ruim');
    expect(corDeltaPreco(0)).toBe('boa');
    expect(corDeltaPreco(-5)).toBe('boa');
  });
});

describe('fonteLabel', () => {
  it('mapeia fontes conhecidas, passa cruas as demais e — para vazio', () => {
    expect(fonteLabel('ml_publico')).toBe('Mercado Livre');
    expect(fonteLabel('serpapi')).toBe('Google Shopping');
    expect(fonteLabel('outra')).toBe('outra');
    expect(fonteLabel('')).toBe('—');
  });
});

describe('posicaoPrecoView', () => {
  const posicao = [
    { sku: 'A', nome: 'Prod A', nossoPreco: 110, precoMercadoMediano: 100, fonte: 'ml_publico' },
    { sku: 'B', nome: 'Prod B', nossoPreco: 0, precoMercadoMediano: 50, fonte: 'serpapi' },
    { sku: 'C', nome: 'Prod C', nossoPreco: 30, precoMercadoMediano: 0, fonte: '' },
  ];
  const faixas = [{ sku: 'A', nome: 'Prod A', min: 80, p25: 90, mediana: 100, p75: 120, fonte: 'ml_publico' }];

  it('deltaPct só quando comparável; semVendas quando nossoPreco=0; fonte pt-BR', () => {
    const r = posicaoPrecoView(posicao, faixas);
    expect(r[0].deltaPct).toBe(10);
    expect(r[0].fonte).toBe('Mercado Livre');
    expect(r[1]).toMatchObject({ semVendas: true, deltaPct: null });
    expect(r[2]).toMatchObject({ semVendas: false, deltaPct: null, fonte: '—' });
  });

  it('faixa com posições % na escala min..max(p75, nosso)', () => {
    const f = posicaoPrecoView(posicao, faixas)[0].faixa;
    // escala 80..120 (nosso=110 < p75=120)
    expect(f).toEqual({ min: 80, p25: 90, mediana: 100, p75: 120, pctP25: 25, pctMediana: 50, pctP75: 100, pctNosso: 75 });
  });

  it('sem faixaMercado (relatório antigo) → faixa null', () => {
    expect(posicaoPrecoView(posicao, undefined)[0].faixa).toBeNull();
  });
});

describe('deltaReceitaPorSku', () => {
  it('deltaPct por sku; null quando não existia antes ou sem anterior', () => {
    const atual = [{ nome: 'A', sku: 'A', quantidade: 1, receita: 120 }, { nome: 'N', sku: 'N', quantidade: 1, receita: 50 }];
    const anterior = [{ nome: 'A', sku: 'A', quantidade: 1, receita: 100 }];
    const m = deltaReceitaPorSku(atual, anterior);
    expect(m.get('A')).toBe(20);
    expect(m.get('N')).toBeNull();
    expect(deltaReceitaPorSku(atual, undefined).get('A')).toBeNull();
  });
});
