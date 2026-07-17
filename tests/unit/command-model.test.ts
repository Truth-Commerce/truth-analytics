import { describe, expect, it } from 'vitest';

import { buildCommands } from '@/components/command-model';

describe('buildCommands', () => {
  it('client: navegação completa (Estoque, Kits, Calendário e Plano de Ação inclusos) + ações (comparar incluso)', () => {
    const cmds = buildCommands('client');
    expect(cmds.map((c) => c.id)).toEqual([
      'nav-dashboard',
      'nav-conexoes',
      'nav-estoque',
      'nav-kits',
      'nav-calendario',
      'nav-configuracoes',
      'nav-plano-de-acao',
      'acao-gerar-relatorio',
      'acao-adicionar-produto',
      'acao-comparar-periodos',
    ]);
    expect(cmds.find((c) => c.id === 'nav-estoque')).toMatchObject({
      label: 'Ir para o Estoque',
      href: '/dashboard/estoque',
      group: 'Navegação',
    });
    expect(cmds.find((c) => c.id === 'nav-kits')).toMatchObject({
      label: 'Ir para Kits sugeridos',
      href: '/dashboard/kits',
      group: 'Navegação',
    });
    expect(cmds.find((c) => c.id === 'nav-calendario')).toMatchObject({
      label: 'Ir para o Calendário comercial',
      href: '/dashboard/calendario',
      group: 'Navegação',
      keywords: 'datas sazonal black friday natal',
    });
    expect(cmds.find((c) => c.id === 'nav-configuracoes')).toMatchObject({
      label: 'Ir para Configurações',
      href: '/configuracoes',
      group: 'Navegação',
    });
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
