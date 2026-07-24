import { describe, expect, it } from 'vitest';

import * as navigation from '@/components/nav-model';

type SidebarModel = typeof navigation & {
  SIDEBAR_STORAGE_KEY: string;
  parseSidebarCollapsed: (value: string | null) => boolean;
  pageTitle: (pathname: string, items: ReturnType<typeof navigation.navItems>) => string;
  variantLabel: (variant: 'client' | 'admin' | 'analista') => string;
};

const model = navigation as SidebarModel;

describe('sidebar-model', () => {
  it('interpreta apenas o valor persistido true como sidebar recolhida', () => {
    expect(model.parseSidebarCollapsed).toBeTypeOf('function');
    expect(model.parseSidebarCollapsed('true')).toBe(true);
    expect(model.parseSidebarCollapsed('false')).toBe(false);
    expect(model.parseSidebarCollapsed(null)).toBe(false);
    expect(model.SIDEBAR_STORAGE_KEY).toBe('truth-sidebar-collapsed');
  });

  it('deriva o título pelo item ativo mais específico e tem fallback', () => {
    const items = navigation.navItems('client');
    expect(model.pageTitle('/dashboard/relatorios/abc', items)).toBe('Dashboard');
    expect(model.pageTitle('/dashboard/plano-de-acao/task-1', items)).toBe('Plano de Ação');
    expect(model.pageTitle('/aguardando', items)).toBe('Visão geral');
  });

  it('expõe o contexto humano de cada perfil', () => {
    expect(model.variantLabel('client')).toBe('Conta cliente');
    expect(model.variantLabel('analista')).toBe('Área do analista');
    expect(model.variantLabel('admin')).toBe('Administração');
  });
});
