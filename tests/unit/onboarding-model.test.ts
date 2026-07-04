import { describe, expect, it } from 'vitest';

import { onboardingCompleto, onboardingSteps } from '@/modules/reports/onboarding-model';

describe('onboarding-model', () => {
  it('3 passos na ordem conectar → produtos → relatório, com hrefs', () => {
    const steps = onboardingSteps({ blingOk: false, temProdutos: false, temRelatorio: false });
    expect(steps.map((s) => s.id)).toEqual(['bling', 'produtos', 'relatorio']);
    expect(steps[0]).toMatchObject({ label: 'Conectar o Bling', done: false, href: '/conexoes' });
    expect(steps[1]).toMatchObject({
      label: 'Adicionar produtos para monitorar',
      href: '/conexoes#produtos-monitorados',
    });
    expect(steps[2]).toMatchObject({
      label: 'Gerar seu primeiro relatório',
      href: '/dashboard#gerar-relatorio',
    });
  });

  it('marca done conforme o progresso', () => {
    const steps = onboardingSteps({ blingOk: true, temProdutos: true, temRelatorio: false });
    expect(steps.map((s) => s.done)).toEqual([true, true, false]);
  });

  it('onboardingCompleto só quando os 3 estão feitos', () => {
    expect(onboardingCompleto({ blingOk: true, temProdutos: true, temRelatorio: true })).toBe(true);
    expect(onboardingCompleto({ blingOk: true, temProdutos: false, temRelatorio: true })).toBe(false);
  });
});
