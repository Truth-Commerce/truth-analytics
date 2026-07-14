import { describe, expect, it } from 'vitest';

import type { Achado } from '@/modules/pipeline/contracts';
import { achadoToTaskInput, FONTES_ANALISE } from '@/modules/tasks/report-to-task';

const ACHADO: Achado = {
  titulo: 'Frete come 12% da receita no Mercado Livre',
  descricao: 'O frete médio de R$ 25 representa 12% da receita do canal.',
  tipo: 'logistica',
  prioridade: 'alta',
  impactoEstimadoMensalBRL: 1200,
  comoFazer: ['Ativar o Mercado Envios Full', 'Renegociar tabela'],
  skus: ['SKU-001'],
};

describe('achadoToTaskInput', () => {
  it('usa titulo direto (sem slice), tipo e prioridade da IA', () => {
    const t = achadoToTaskInput(ACHADO, 'r1');
    expect(t.titulo).toBe('Frete come 12% da receita no Mercado Livre');
    expect(t.tipo).toBe('logistica');
    expect(t.prioridade).toBe('alta');
    expect(t.criadoPor).toBe('ia');
    expect(t.reportId).toBe('r1');
  });

  it('descricao carrega impacto, SKUs, origem e passos como checklist', () => {
    const t = achadoToTaskInput(ACHADO, 'r1');
    expect(t.descricao).toContain('R$');
    expect(t.descricao).toContain('1.200');
    expect(t.descricao).toContain('SKUs: SKU-001');
    expect(t.descricao).toContain('_Origem: análise IA do relatório._');
    expect(t.descricao).toContain('- [ ] Ativar o Mercado Envios Full');
    expect(t.descricao).toContain('- [ ] Renegociar tabela');
  });

  it('sem impacto/skus/passos → descricao sem essas linhas', () => {
    const t = achadoToTaskInput(
      { ...ACHADO, impactoEstimadoMensalBRL: null, skus: [], comoFazer: [] },
      'r1',
    );
    expect(t.descricao).not.toContain('Impacto estimado');
    expect(t.descricao).not.toContain('SKUs:');
    expect(t.descricao).not.toContain('- [ ]');
  });
});

describe('FONTES_ANALISE', () => {
  it("inclui 'achados' (a action valida fonte contra este array)", () => {
    expect(FONTES_ANALISE).toContain('achados');
  });
});
