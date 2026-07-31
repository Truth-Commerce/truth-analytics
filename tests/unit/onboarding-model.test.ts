import { describe, expect, it } from 'vitest';

import { onboardingCompleto, onboardingSteps } from '@/modules/reports/onboarding-model';

describe('onboarding-model', () => {
  it('3 passos na ordem conectar → produtos → relatório, com hrefs', () => {
    const steps = onboardingSteps({ erpOk: false, erpLabel: 'Olist', temProdutos: false, temRelatorio: false });
    expect(steps.map((s) => s.id)).toEqual(['erp', 'produtos', 'relatorio']);
    expect(steps[0]).toMatchObject({ label: 'Conectar seu ERP', done: false, href: '/conexoes' });
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
    const steps = onboardingSteps({ erpOk: true, erpLabel: 'Olist', temProdutos: true, temRelatorio: false });
    expect(steps.map((s) => s.done)).toEqual([true, true, false]);
  });

  it('onboardingCompleto só quando os 3 estão feitos', () => {
    expect(onboardingCompleto({ erpOk: true, erpLabel: 'Olist', temProdutos: true, temRelatorio: true })).toBe(true);
    expect(onboardingCompleto({ erpOk: true, erpLabel: 'Olist', temProdutos: false, temRelatorio: true })).toBe(false);
  });
});
