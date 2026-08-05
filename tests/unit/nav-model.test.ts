import { describe, expect, it } from 'vitest';

import {
  atalhoPaletaLabel,
  hrefAtivo,
  logoHref,
  navItems,
  shellVariantForRole,
} from '@/components/nav-model';

describe('navItems — nav por papel', () => {
  it('client vê Dashboard, Conexões, Estoque, Kits, Calendário, Plano de Ação (com badge) e Configurações', () => {
    expect(navItems('client')).toEqual([
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', description: 'Visão geral do negócio' },
      { href: '/conexoes', label: 'Conexões', icon: 'connections', description: 'Integrações e canais' },
      { href: '/dashboard/estoque', label: 'Estoque', icon: 'inventory', description: 'Cobertura e disponibilidade' },
      { href: '/dashboard/kits', label: 'Kits', icon: 'kits', description: 'Oportunidades de combinação' },
      { href: '/dashboard/calendario', label: 'Calendário', icon: 'calendar', description: 'Planejamento comercial' },
      {
        href: '/dashboard/plano-de-acao',
        label: 'Plano de Ação',
        icon: 'tasks',
        description: 'Prioridades e execução',
        badge: true,
      },
      { href: '/configuracoes', label: 'Configurações', icon: 'settings', description: 'Preferências da conta' },
    ]);
  });

  it('admin NÃO vê rotas de cliente, mas tem Carteira, Performance, Operações e Usuários (G3/T10, H4/T13)', () => {
    const hrefs = navItems('admin').map((i) => i.href);
    expect(hrefs).toEqual([
      '/admin',
      '/admin/playbooks',
      '/admin/consultoria',
      '/analista',
      '/analista/conexoes',
      '/admin/performance',
      '/admin/operacoes',
      '/admin/usuarios',
    ]);
    expect(hrefs).not.toContain('/dashboard');
    expect(hrefs).not.toContain('/conexoes');
  });

  it('analista usa somente rotas com contexto explícito de cliente', () => {
    expect(navItems('analista')).toEqual([
      { href: '/analista', label: 'Carteira', icon: 'portfolio', description: 'Clientes sob acompanhamento' },
      { href: '/analista/comparativo', label: 'Comparativo', icon: 'compare', description: 'Compare contas e períodos' },
      { href: '/analista/conexoes', label: 'Conexões', icon: 'connections', description: 'Configure o ERP dos clientes' },
    ]);
    expect(navItems('analista').some((item) => item.href.startsWith('/dashboard'))).toBe(false);
  });

  it('cliente não recebe áreas exclusivas do analista', () => {
    const hrefs = navItems('client').map((item) => item.href);
    expect(hrefs).not.toContain('/analista');
    expect(hrefs).not.toContain('/analista/comparativo');
  });
});

describe('logoHref', () => {
  it('leva cada papel para a sua home', () => {
    expect(logoHref('client')).toBe('/dashboard');
    expect(logoHref('admin')).toBe('/admin');
    expect(logoHref('analista')).toBe('/analista');
  });
});

describe('shellVariantForRole', () => {
  it('mantém o shell de analista no dashboard e o shell de cliente nos demais papéis', () => {
    expect(shellVariantForRole('analista')).toBe('analista');
    expect(shellVariantForRole('client')).toBe('client');
    expect(shellVariantForRole('admin_truth')).toBe('client');
    expect(shellVariantForRole(null)).toBe('client');
  });
});

describe('hrefAtivo — prefixo mais longo', () => {
  const hrefs = ['/dashboard', '/conexoes', '/dashboard/plano-de-acao'];

  it('rota exata', () => {
    expect(hrefAtivo('/dashboard', hrefs)).toBe('/dashboard');
  });

  it('sub-rota ativa o item mais específico (não o Dashboard)', () => {
    expect(hrefAtivo('/dashboard/plano-de-acao/task-1', hrefs)).toBe('/dashboard/plano-de-acao');
  });

  it('sub-rota sem item próprio ativa o pai', () => {
    expect(hrefAtivo('/dashboard/relatorios/abc', hrefs)).toBe('/dashboard');
  });

  it('rota fora da nav → null (nada aceso); prefixo respeita fronteira de segmento', () => {
    expect(hrefAtivo('/aguardando', hrefs)).toBeNull();
    expect(hrefAtivo('/dashboards-fake', hrefs)).toBeNull();
  });
});

describe('atalhoPaletaLabel', () => {
  it('mac/iOS → ⌘ K; resto → Ctrl K', () => {
    expect(atalhoPaletaLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('⌘ K');
    expect(atalhoPaletaLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('⌘ K');
    expect(atalhoPaletaLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Ctrl K');
    expect(atalhoPaletaLabel('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Ctrl K');
  });
});
