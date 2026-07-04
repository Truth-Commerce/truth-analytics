import { describe, expect, it } from 'vitest';

import { ETAPAS_GERACAO, geracaoView } from '@/modules/reports/stepper-model';

describe('stepper-model', () => {
  it('tem as 5 etapas na ordem da experiência', () => {
    expect(ETAPAS_GERACAO.map((e) => e.label)).toEqual([
      'Conectando ao Bling',
      'Coletando pedidos',
      'Varrendo o mercado',
      'IA analisando',
      'Finalizando',
    ]);
  });

  it('queued (sem etapa) = conectando', () => {
    expect(geracaoView('queued', null)).toEqual({ activeIndex: 0, failed: false, done: false });
  });

  it('running mapeia cada etapa do pipeline para o passo certo', () => {
    expect(geracaoView('running', 'coletando_vendas').activeIndex).toBe(1);
    expect(geracaoView('running', 'analisando_mercado').activeIndex).toBe(2);
    expect(geracaoView('running', 'analisando_ia').activeIndex).toBe(3);
    expect(geracaoView('running', 'finalizando').activeIndex).toBe(4);
  });

  it('running sem etapa ainda = conectando', () => {
    expect(geracaoView('running', null).activeIndex).toBe(0);
  });

  it('done = tudo concluído', () => {
    expect(geracaoView('done', 'finalizando')).toEqual({
      activeIndex: ETAPAS_GERACAO.length,
      failed: false,
      done: true,
    });
  });

  it('failed marca o passo corrente como falho', () => {
    expect(geracaoView('failed', 'analisando_ia')).toEqual({
      activeIndex: 3,
      failed: true,
      done: false,
    });
  });
});
