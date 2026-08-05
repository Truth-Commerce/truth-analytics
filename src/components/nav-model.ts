/** Regras puras da navegação do AppShell — testáveis em node. */

import type { UserRole } from '@/modules/auth/user.types';

export type NavIconName =
  | 'dashboard'
  | 'connections'
  | 'inventory'
  | 'kits'
  | 'calendar'
  | 'tasks'
  | 'settings'
  | 'clients'
  | 'playbooks'
  | 'consulting'
  | 'portfolio'
  | 'performance'
  | 'operations'
  | 'users'
  | 'compare';

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  description: string;
  badge?: boolean;
};

export function navItems(variant: 'client' | 'admin' | 'analista'): NavItem[] {
  if (variant === 'admin') {
    return [
      { href: '/admin', label: 'Clientes', icon: 'clients', description: 'Contas e operação' },
      { href: '/admin/playbooks', label: 'Playbooks', icon: 'playbooks', description: 'Modelos de execução' },
      { href: '/admin/consultoria', label: 'Consultoria', icon: 'consulting', description: 'Visão consolidada' },
      // G3/T10: admin precisa de caminho até a fila de revisão do analista
      // (acesso a /analista permitido para admin_truth).
      { href: '/analista', label: 'Carteira', icon: 'portfolio', description: 'Clientes sob acompanhamento' },
      { href: '/analista/conexoes', label: 'Conexões', icon: 'connections', description: 'Configure o ERP dos clientes' },
      // H4/T13: painéis de operação e gestão.
      { href: '/admin/performance', label: 'Performance', icon: 'performance', description: 'Resultados da equipe' },
      { href: '/admin/operacoes', label: 'Operações', icon: 'operations', description: 'Saúde dos processos' },
      { href: '/admin/usuarios', label: 'Usuários', icon: 'users', description: 'Acessos e permissões' },
    ];
  }
  if (variant === 'analista') {
    return [
      { href: '/analista', label: 'Carteira', icon: 'portfolio', description: 'Clientes sob acompanhamento' },
      { href: '/analista/comparativo', label: 'Comparativo', icon: 'compare', description: 'Compare contas e períodos' },
      { href: '/analista/conexoes', label: 'Conexões', icon: 'connections', description: 'Configure o ERP dos clientes' },
    ];
  }
  return [
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
  ];
}

export function logoHref(variant: 'client' | 'admin' | 'analista'): string {
  if (variant === 'admin') return '/admin';
  if (variant === 'analista') return '/analista';
  return '/dashboard';
}

export function shellVariantForRole(
  role: UserRole | null | undefined,
): 'client' | 'analista' {
  return role === 'analista' ? 'analista' : 'client';
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

export {
  SIDEBAR_STORAGE_KEY,
  pageTitle,
  parseSidebarCollapsed,
  variantLabel,
} from './sidebar-model';
