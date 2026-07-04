import { describe, expect, it } from 'vitest';

import { buildCommands } from '@/components/command-model';

describe('buildCommands', () => {
  it('client: navegação (sem admin) + ações', () => {
    const cmds = buildCommands('client');
    expect(cmds.map((c) => c.id)).toEqual([
      'nav-dashboard',
      'nav-conexoes',
      'acao-gerar-relatorio',
      'acao-adicionar-produto',
    ]);
    expect(cmds.find((c) => c.id === 'acao-gerar-relatorio')).toMatchObject({
      label: 'Gerar relatório',
      href: '/dashboard#gerar-relatorio',
      group: 'Ações',
    });
  });

  it('admin: inclui a navegação do painel admin', () => {
    const cmds = buildCommands('admin');
    expect(cmds.some((c) => c.id === 'nav-admin' && c.href === '/admin')).toBe(true);
  });
});
