import { describe, expect, it } from 'vitest';

import type { Achado } from '@/modules/pipeline/contracts';
import { achadoToTaskInput } from '@/modules/tasks/report-to-task';

const ACHADO: Achado = {
  titulo: 'Frete come 12% da receita no Mercado Livre',
  descricao: 'O frete médio de R$ 25 representa 12% da receita do canal.',
  tipo: 'logistica',
  prioridade: 'alta',
  impactoEstimadoMensalBRL: 1200,
  comoFazer: ['Ativar o Mercado Envios Full'],
  skus: ['SKU-001'],
};

describe('achadoToTaskInput v2 (extras)', () => {
  it('sem extras: comportamento G1 intacto (sem baseline nem link)', () => {
    const t = achadoToTaskInput(ACHADO, 'r1');
    expect(t.descricao).not.toContain('Vendas do período');
    expect(t.descricao).not.toContain('[Ver relatório]');
  });

  it('baseline vira linha "Vendas do período" + link markdown para o relatório', () => {
    const t = achadoToTaskInput(ACHADO, 'r1', { baselineVendas: 10880.5 });
    expect(t.descricao).toContain('Vendas do período: R$');
    expect(t.descricao).toContain('10.880,50');
    expect(t.descricao).toContain('[Ver relatório](/dashboard/relatorios/r1)');
  });

  it('checklist do playbook entra APÓS os passos da IA, como itens não marcados', () => {
    const t = achadoToTaskInput(ACHADO, 'r1', { checklistPlaybook: ['Conferir tabela de frete'] });
    const desc = t.descricao;
    expect(desc).toContain('- [ ] Ativar o Mercado Envios Full');
    expect(desc).toContain('- [ ] Conferir tabela de frete');
    expect(desc.indexOf('Ativar o Mercado Envios Full')).toBeLessThan(desc.indexOf('Conferir tabela de frete'));
  });

  it('baselineVendas null não gera linha', () => {
    const t = achadoToTaskInput(ACHADO, 'r1', { baselineVendas: null });
    expect(t.descricao).not.toContain('Vendas do período');
  });
});
