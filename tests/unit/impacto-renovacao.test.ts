import { describe, expect, it } from 'vitest';

import { impactoRenovacao } from '@/modules/analista/impacto-renovacao';

const base = { orgId: 'o1', orgName: 'Org' };

describe('impactoRenovacao', () => {
  it('deltas de faturamento (1 casa) e score', () => {
    const r = impactoRenovacao({
      ...base,
      primeiro: { total: 9700, score: 58, periodoFim: new Date('2026-05-31') },
      ultimo: { total: 10880, score: 76, periodoFim: new Date('2026-06-30') },
      tasksConcluidas: 5,
    });
    expect(r.deltaFaturamentoPct).toBe(12.2);
    expect(r.deltaScore).toBe(18);
    expect(r.tasksConcluidas).toBe(5);
  });

  it('sem 2 dones → deltas null', () => {
    const r = impactoRenovacao({ ...base, primeiro: null, ultimo: null, tasksConcluidas: 0 });
    expect(r.deltaFaturamentoPct).toBeNull();
    expect(r.deltaScore).toBeNull();
  });

  it('primeiro com total 0 → deltaFaturamentoPct null (sem divisão por zero)', () => {
    const r = impactoRenovacao({
      ...base,
      primeiro: { total: 0, score: null, periodoFim: new Date('2026-05-31') },
      ultimo: { total: 100, score: 60, periodoFim: new Date('2026-06-30') },
      tasksConcluidas: 1,
    });
    expect(r.deltaFaturamentoPct).toBeNull();
    expect(r.deltaScore).toBeNull(); // score do primeiro é null
  });

  it('queda de faturamento → delta negativo com 1 casa', () => {
    const r = impactoRenovacao({
      ...base,
      primeiro: { total: 10000, score: 70, periodoFim: new Date('2026-05-31') },
      ultimo: { total: 8750, score: 60, periodoFim: new Date('2026-06-30') },
      tasksConcluidas: 2,
    });
    expect(r.deltaFaturamentoPct).toBe(-12.5);
    expect(r.deltaScore).toBe(-10);
  });
});
