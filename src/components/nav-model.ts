/** Regras puras da navegação do AppShell — testáveis em node. */

export type NavItem = { href: string; label: string; badge?: boolean };

export function navItems(variant: 'client' | 'admin' | 'analista'): NavItem[] {
  if (variant === 'admin') {
    return [
      { href: '/admin', label: 'Clientes' },
      { href: '/admin/playbooks', label: 'Playbooks' },
      { href: '/admin/consultoria', label: 'Consultoria' },
      // G3/T10: admin precisa de caminho até a fila de revisão do analista
      // (acesso a /analista permitido para admin_truth).
      { href: '/analista', label: 'Carteira' },
    ];
  }
  if (variant === 'analista') {
    return [{ href: '/analista', label: 'Carteira' }];
  }
  return [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/conexoes', label: 'Conexões' },
    { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', badge: true },
  ];
}

export function logoHref(variant: 'client' | 'admin' | 'analista'): string {
  if (variant === 'admin') return '/admin';
  if (variant === 'analista') return '/analista';
  return '/dashboard';
}

/**
 * Item ativo da nav: o href que é o prefixo MAIS LONGO do pathname
 * (com fronteira de segmento — '/dashboard' não ativa '/dashboards-fake').
 */
export function hrefAtivo(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a));
}

export function atalhoPaletaLabel(userAgent: string): 'Ctrl K' | '⌘ K' {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent) ? '⌘ K' : 'Ctrl K';
}
