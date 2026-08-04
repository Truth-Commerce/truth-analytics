export type OnboardingInput = {
  erpOk: boolean;
  erpLabel: string;
  temProdutos: boolean;
  temRelatorio: boolean;
};

export type OnboardingStep = {
  id: 'erp' | 'produtos' | 'relatorio';
  label: string;
  done: boolean;
  href: string;
};

/** Checklist pós-ativação (pura): conectar ERP → produtos → primeiro relatório. */
export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  return [
    { id: 'erp', label: 'Conectar seu ERP', done: input.erpOk, href: '/conexoes' },
    {
      id: 'produtos',
      label: 'Adicionar produtos para monitorar',
      done: input.temProdutos,
      href: '/conexoes#produtos-monitorados',
    },
    {
      id: 'relatorio',
      label: 'Gerar seu primeiro relatório',
      done: input.temRelatorio,
      href: '/dashboard#gerar-relatorio',
    },
  ];
}

export function onboardingCompleto(input: OnboardingInput): boolean {
  return input.erpOk && input.temProdutos && input.temRelatorio;
}
