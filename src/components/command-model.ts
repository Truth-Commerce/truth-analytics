export type CommandItem = {
  id: string;
  label: string;
  group: 'Navegação' | 'Ações';
  href: string;
  keywords?: string;
};

/** Comandos do ⌘K por variante do shell (pura). */
export function buildCommands(variant: 'client' | 'admin' | 'analista'): CommandItem[] {
  // 'analista' tem seu próprio caso: navega para a carteira, sem os links de
  // Dashboard/Conexões/Admin (rotas do papel cliente/admin) nem as Ações
  // (gerar relatório/adicionar produto são fluxos do cliente sobre a própria
  // org — não fazem sentido no contexto multi-org do analista).
  if (variant === 'analista') {
    return [{ id: 'nav-analista', label: 'Ir para a Carteira', group: 'Navegação', href: '/analista', keywords: 'clientes tasks kanban revisão' }];
  }

  const nav: CommandItem[] = [
    { id: 'nav-dashboard', label: 'Ir para o Dashboard', group: 'Navegação', href: '/dashboard' },
    { id: 'nav-conexoes', label: 'Ir para Conexões', group: 'Navegação', href: '/conexoes', keywords: 'bling produtos' },
  ];
  if (variant === 'admin') {
    nav.push({ id: 'nav-admin', label: 'Ir para o Admin', group: 'Navegação', href: '/admin', keywords: 'clientes' });
  }
  const acoes: CommandItem[] = [
    {
      id: 'acao-gerar-relatorio',
      label: 'Gerar relatório',
      group: 'Ações',
      href: '/dashboard#gerar-relatorio',
      keywords: 'análise ia relatório novo',
    },
    {
      id: 'acao-adicionar-produto',
      label: 'Adicionar produto monitorado',
      group: 'Ações',
      href: '/conexoes#produtos-monitorados',
      keywords: 'sku keywords monitorar',
    },
  ];
  return [...nav, ...acoes];
}
