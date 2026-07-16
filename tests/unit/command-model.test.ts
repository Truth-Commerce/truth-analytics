import { describe, expect, it } from 'vitest';

import { buildCommands } from '@/components/command-model';

describe('buildCommands', () => {
  it('client: navegação completa (Plano de Ação incluso) + ações (comparar incluso)', () => {
    const cmds = buildCommands('client');
    expect(cmds.map((c) => c.id)).toEqual([
      'nav-dashboard',
      'nav-conexoes',
      'nav-plano-de-acao',
      'acao-gerar-relatorio',
      'acao-adicionar-produto',
      'acao-comparar-periodos',
    ]);
    expect(cmds.find((c) => c.id === 'nav-plano-de-acao')).toMatchObject({
      label: 'Ir para o Plano de Ação',
      href: '/dashboard/plano-de-acao',
      group: 'Navegação',
    });
    expect(cmds.find((c) => c.id === 'acao-comparar-periodos')).toMatchObject({
      label: 'Comparar períodos',
      href: '/dashboard/relatorios/comparar',
      group: 'Ações',
    });
  });

  it('admin: só navegação do papel admin (sem rotas nem ações de cliente)', () => {
    const cmds = buildCommands('admin');
    expect(cmds.map((c) => c.id)).toEqual(['nav-admin', 'nav-playbooks', 'nav-consultoria']);
    expect(cmds.every((c) => c.group === 'Navegação')).toBe(true);
  });

  it('analista: só a navegação da carteira', () => {
    const cmds = buildCommands('analista');
    expect(cmds).toEqual([
      { id: 'nav-analista', label: 'Ir para a Carteira', group: 'Navegação', href: '/analista', keywords: 'clientes tasks kanban revisão' },
    ]);
  });
});
