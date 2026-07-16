import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/lib/format';
import {
  detectarConcorrenteAbaixo,
  detectarProdutoParado,
  detectarQuedaVendas,
  filtrarNaoDuplicados,
} from '@/modules/alerts/alert-detectors';

describe('detectarQuedaVendas', () => {
  it('queda para 40% da média → atencao', () => {
    const r = detectarQuedaVendas({ total7dias: 400, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] });
    expect(r).not.toBeNull();
    expect(r?.severidade).toBe('atencao'); // razao 0.4 (≥0.3, <0.5)
    expect(r?.dados.quedaPercentual).toBe(60);
    expect(r?.chaveDedup).toBe('queda_vendas');
  });
  it('queda para 20% da média → critico', () => {
    const r = detectarQuedaVendas({ total7dias: 200, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] });
    expect(r?.severidade).toBe('critico'); // razao 0.2 < 0.3
  });
  it('50% exato NÃO alerta (limiar é estrito)', () => {
    expect(detectarQuedaVendas({ total7dias: 500, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] })).toBeNull();
  });
  it('base ruidosa (média < R$100) NÃO alerta', () => {
    expect(detectarQuedaVendas({ total7dias: 10, totaisSemanasAnteriores: [80, 90, 70, 60] })).toBeNull();
  });
  it('menos de 4 semanas de histórico NÃO alerta', () => {
    expect(detectarQuedaVendas({ total7dias: 0, totaisSemanasAnteriores: [1000, 1000] })).toBeNull();
  });
});

describe('detectarConcorrenteAbaixo', () => {
  const item = (sku: string, nosso: number, mercado: number) =>
    ({ sku, nome: `Produto ${sku}`, nossoPreco: nosso, precoMercadoMediano: mercado, fonte: 'ml_publico' });
  it('mercado 10% abaixo → atencao; 20% abaixo → critico; 4% abaixo → nada', () => {
    const r = detectarConcorrenteAbaixo([item('A', 100, 90), item('B', 100, 80), item('C', 100, 96)]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ severidade: 'atencao', chaveDedup: 'concorrente_preco:A', dados: { diferencaPercentual: 10 } });
    expect(r[1]).toMatchObject({ severidade: 'critico', chaveDedup: 'concorrente_preco:B' });
  });
  it('sem preço próprio ou sem benchmark → nada', () => {
    expect(detectarConcorrenteAbaixo([item('A', 0, 90), item('B', 100, 0)])).toHaveLength(0);
  });
});

describe('detectarProdutoParado', () => {
  const agora = new Date('2026-07-03T12:00:00Z');
  it('parado há 20 dias → alerta; 5 dias → nada; nunca vendeu → nada', () => {
    const ultimaVenda = new Map<string, Date>([
      ['A', new Date('2026-06-13T12:00:00Z')], // 20 dias
      ['B', new Date('2026-06-28T12:00:00Z')], // 5 dias
    ]);
    const r = detectarProdutoParado(
      [{ sku: 'A', nome: 'Alfa' }, { sku: 'B', nome: 'Beta' }, { sku: 'C', nome: 'Gama' }],
      ultimaVenda,
      agora,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ chaveDedup: 'produto_parado:A', dados: { diasSemVenda: 20 } });
  });
  it('exatamente 14 dias → alerta (limiar inclusivo)', () => {
    const r = detectarProdutoParado(
      [{ sku: 'A', nome: 'Alfa' }],
      new Map([['A', new Date('2026-06-19T12:00:00Z')]]),
      agora,
    );
    expect(r).toHaveLength(1);
  });
});

describe('formatação pt-BR dos corpos de alerta (G4)', () => {
  it('queda de vendas usa separador de milhar', () => {
    const a = detectarQuedaVendas({
      total7dias: 1234.5,
      totaisSemanasAnteriores: [10000, 10000, 10000, 10000],
    });
    expect(a).not.toBeNull();
    expect(a!.corpo).toContain(formatBRL(1234.5)); // "R$ 1.234,50" (com NBSP do Intl)
    expect(a!.corpo).toContain(formatBRL(10000));
  });

  it('produto parado exibe a última venda em dd/mm/aaaa (não ISO)', () => {
    const ultima = new Date('2026-06-20T12:00:00Z');
    const [a] = detectarProdutoParado(
      [{ sku: 'SKU1', nome: 'Caneca' }],
      new Map([['SKU1', ultima]]),
      new Date('2026-07-14T12:00:00Z'),
    );
    expect(a!.corpo).not.toContain('2026-06-20');
    expect(a!.corpo).toContain('20/06/2026');
  });
});

describe('filtrarNaoDuplicados', () => {
  it('remove candidato com alerta aberto do mesmo tipo+chave; mantém os demais', () => {
    const candidatos = [
      detectarQuedaVendas({ total7dias: 200, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] })!,
      ...detectarConcorrenteAbaixo([{ sku: 'A', nome: 'Alfa', nossoPreco: 100, precoMercadoMediano: 80, fonte: 'serpapi' }]),
    ];
    const r = filtrarNaoDuplicados(candidatos, [{ tipo: 'queda_vendas', chaveDedup: 'queda_vendas' }]);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('concorrente_preco');
  });
});
