import type { NavItem } from './nav-model';

export const SIDEBAR_STORAGE_KEY = 'truth-sidebar-collapsed';

export function parseSidebarCollapsed(value: string | null): boolean {
  return value === 'true';
}

export function pageTitle(pathname: string, items: NavItem[]): string {
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .reduce<NavItem | null>(
      (longest, item) => (!longest || item.href.length > longest.href.length ? item : longest),
      null,
    );

  return active?.label ?? 'Visão geral';
}

export function variantLabel(variant: 'client' | 'admin' | 'analista'): string {
  if (variant === 'admin') return 'Administração';
  if (variant === 'analista') return 'Área do analista';
  return 'Conta cliente';
}
