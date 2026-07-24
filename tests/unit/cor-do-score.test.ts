import { describe, expect, it } from 'vitest';

import { corDoScore } from '@/components/ui/charts/chart-theme';

describe('corDoScore — faixas e tokens', () => {
  it('≥70 → brand', () => {
    expect(corDoScore(70)).toBe('#137a3e');
    expect(corDoScore(100)).toBe('#137a3e');
  });

  it('40–69 → warning.DEFAULT (não mais #eab308 fora do token)', () => {
    expect(corDoScore(40)).toBe('#b66a00');
    expect(corDoScore(69)).toBe('#b66a00');
  });

  it('<40 → danger.DEFAULT', () => {
    expect(corDoScore(39)).toBe('#c93c37');
    expect(corDoScore(0)).toBe('#c93c37');
  });
});
