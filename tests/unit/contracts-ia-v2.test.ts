import { describe, expect, it } from 'vitest';

import { AchadoSchema, AnaliseIaSchema } from '@/modules/pipeline/contracts';

const ANALISE_ANTIGA = {
  resumoExecutivo: 'Resumo.',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit'],
  recomendacoesPreco: [{ sku: 'S1', nome: 'P1', precoSugerido: 98, justificativa: 'Mediana.' }],
};

const ACHADO = {
  titulo: 'Frete come 12% da receita no Mercado Livre',
  descricao: 'O frete médio de R$ 25 representa 12% da receita do canal.',
  tipo: 'logistica',
  prioridade: 'alta',
  impactoEstimadoMensalBRL: 1200,
  comoFazer: ['Ativar o Mercado Envios Full', 'Renegociar tabela com a transportadora'],
  skus: ['SKU-001'],
};

describe('AnaliseIaSchema v2 — retrocompat total', () => {
  it('análise ANTIGA (sem achados/destaques/precoAtual) continua válida', () => {
    expect(AnaliseIaSchema.safeParse(ANALISE_ANTIGA).success).toBe(true);
  });

  it('análise v2 com achados, destaques e precoAtual é válida', () => {
    const v2 = {
      ...ANALISE_ANTIGA,
      achados: [ACHADO],
      destaques: [{ label: 'Total do período', valor: 'R$ 10.880', direcao: 'up' }],
      recomendacoesPreco: [
        { sku: 'S1', nome: 'P1', precoAtual: 105, precoSugerido: 98, justificativa: 'Mediana.' },
      ],
    };
    expect(AnaliseIaSchema.safeParse(v2).success).toBe(true);
  });

  it('titulo de achado com mais de 80 chars é rejeitado', () => {
    expect(AchadoSchema.safeParse({ ...ACHADO, titulo: 'x'.repeat(81) }).success).toBe(false);
  });

  it('tipo fora do enum é rejeitado', () => {
    expect(AchadoSchema.safeParse({ ...ACHADO, tipo: 'financeiro' }).success).toBe(false);
  });

  it('impactoEstimadoMensalBRL aceita null (impacto não quantificável)', () => {
    expect(AchadoSchema.safeParse({ ...ACHADO, impactoEstimadoMensalBRL: null }).success).toBe(true);
  });
});
