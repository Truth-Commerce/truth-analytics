import { describe, expect, it } from 'vitest';

import { progressoMeta } from '@/modules/reports/compare';

describe('progressoMeta', () => {
  it.each([
    { totalMes: 5000, meta: 10000, esperado: { percentual: 50, restante: 5000, atingida: false } },
    { totalMes: 12000, meta: 10000, esperado: { percentual: 120, restante: 0, atingida: true } },
    { totalMes: 10000, meta: 10000, esperado: { percentual: 100, restante: 0, atingida: true } },
    { totalMes: 3333.33, meta: 10000, esperado: { percentual: 33, restante: 6666.67, atingida: false } },
    { totalMes: 999999, meta: 10, esperado: { percentual: 999, restante: 0, atingida: true } }, // cap
  ])('R$ $totalMes de R$ $meta → $esperado.percentual%', ({ totalMes, meta, esperado }) => {
    expect(progressoMeta(totalMes, meta)).toEqual(esperado);
  });

  it('meta null ou ≤ 0 → null', () => {
    expect(progressoMeta(5000, null)).toBeNull();
    expect(progressoMeta(5000, 0)).toBeNull();
  });
});
