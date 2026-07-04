export type OnboardingInput = {
  blingOk: boolean;
  temProdutos: boolean;
  temRelatorio: boolean;
};

export type OnboardingStep = {
  id: 'bling' | 'produtos' | 'relatorio';
  label: string;
  done: boolean;
  href: string;
};

/** Checklist pós-ativação (pura): conectar Bling → produtos → primeiro relatório. */
export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  return [
    { id: 'bling', label: 'Conectar o Bling', done: input.blingOk, href: '/conexoes' },
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
  return input.blingOk && input.temProdutos && input.temRelatorio;
}
