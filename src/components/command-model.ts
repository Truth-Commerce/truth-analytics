export type CommandItem = {
  id: string;
  label: string;
  group: 'Navegação' | 'Ações';
  href: string;
  keywords?: string;
};

/**
 * Comandos do ⌘K por papel (pura). Coerente com a nav por papel do shell:
 * admin/analista não recebem rotas nem ações de cliente.
 */
export function buildCommands(variant: 'client' | 'admin' | 'analista'): CommandItem[] {
  if (variant === 'analista') {
    return [{ id: 'nav-analista', label: 'Ir para a Carteira', group: 'Navegação', href: '/analista', keywords: 'clientes tasks kanban revisão' }];
  }

  if (variant === 'admin') {
    return [
      { id: 'nav-admin', label: 'Ir para Clientes', group: 'Navegação', href: '/admin', keywords: 'clientes orgs' },
      { id: 'nav-playbooks', label: 'Ir para Playbooks', group: 'Navegação', href: '/admin/playbooks', keywords: 'templates tasks' },
      { id: 'nav-consultoria', label: 'Ir para Consultoria', group: 'Navegação', href: '/admin/consultoria', keywords: 'métricas analistas' },
    ];
  }

  return [
    { id: 'nav-dashboard', label: 'Ir para o Dashboard', group: 'Navegação', href: '/dashboard' },
    { id: 'nav-conexoes', label: 'Ir para Conexões', group: 'Navegação', href: '/conexoes', keywords: 'bling produtos' },
    { id: 'nav-estoque', label: 'Ir para o Estoque', group: 'Navegação', href: '/dashboard/estoque', keywords: 'saldo cobertura reposicao produtos' },
    { id: 'nav-kits', label: 'Ir para Kits sugeridos', group: 'Navegação', href: '/dashboard/kits', keywords: 'kit combo sugestao vender junto' },
    { id: 'nav-calendario', label: 'Ir para o Calendário comercial', group: 'Navegação', href: '/dashboard/calendario', keywords: 'datas sazonal black friday natal' },
    { id: 'nav-configuracoes', label: 'Ir para Configurações', group: 'Navegação', href: '/configuracoes', keywords: 'senha empresa conta plano' },
    { id: 'nav-plano-de-acao', label: 'Ir para o Plano de Ação', group: 'Navegação', href: '/dashboard/plano-de-acao', keywords: 'tasks tarefas kanban consultoria' },
    { id: 'acao-gerar-relatorio', label: 'Gerar relatório', group: 'Ações', href: '/dashboard#gerar-relatorio', keywords: 'análise ia relatório novo' },
    { id: 'acao-adicionar-produto', label: 'Adicionar produto monitorado', group: 'Ações', href: '/conexoes#produtos-monitorados', keywords: 'sku keywords monitorar' },
    { id: 'acao-comparar-periodos', label: 'Comparar períodos', group: 'Ações', href: '/dashboard/relatorios/comparar', keywords: 'relatórios comparação evolução' },
  ];
}
