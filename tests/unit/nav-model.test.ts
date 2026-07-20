import { describe, expect, it } from 'vitest';

import { atalhoPaletaLabel, hrefAtivo, logoHref, navItems } from '@/components/nav-model';

describe('navItems — nav por papel', () => {
  it('client vê Dashboard, Conexões, Estoque, Kits, Calendário, Plano de Ação (com badge) e Configurações', () => {
    expect(navItems('client')).toEqual([
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/conexoes', label: 'Conexões' },
      { href: '/dashboard/estoque', label: 'Estoque' },
      { href: '/dashboard/kits', label: 'Kits' },
      { href: '/dashboard/calendario', label: 'Calendário' },
      { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', badge: true },
      { href: '/configuracoes', label: 'Configurações' },
    ]);
  });

  it('admin NÃO vê rotas de cliente, mas tem Carteira, Performance, Operações e Usuários (G3/T10, H4/T13)', () => {
    const hrefs = navItems('admin').map((i) => i.href);
    expect(hrefs).toEqual([
      '/admin',
      '/admin/playbooks',
      '/admin/consultoria',
      '/analista',
      '/admin/performance',
      '/admin/operacoes',
      '/admin/usuarios',
    ]);
    expect(hrefs).not.toContain('/dashboard');
    expect(hrefs).not.toContain('/conexoes');
  });

  it('analista vê a Carteira e o Comparativo (H4/T13)', () => {
    expect(navItems('analista')).toEqual([
      { href: '/analista', label: 'Carteira' },
      { href: '/analista/comparativo', label: 'Comparativo' },
    ]);
  });
});

describe('logoHref', () => {
  it('leva cada papel para a sua home', () => {
    expect(logoHref('client')).toBe('/dashboard');
    expect(logoHref('admin')).toBe('/admin');
    expect(logoHref('analista')).toBe('/analista');
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
