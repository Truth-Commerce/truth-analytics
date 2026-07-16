import { describe, expect, it } from 'vitest';

import { corDoScore } from '@/components/ui/charts/chart-theme';

describe('corDoScore — faixas e tokens', () => {
  it('≥70 → brand', () => {
    expect(corDoScore(70)).toBe('#07dd2b');
    expect(corDoScore(100)).toBe('#07dd2b');
  });

  it('40–69 → warning.DEFAULT (não mais #eab308 fora do token)', () => {
    expect(corDoScore(40)).toBe('#f59e0b');
    expect(corDoScore(69)).toBe('#f59e0b');
  });

  it('<40 → danger.DEFAULT', () => {
    expect(corDoScore(39)).toBe('#ef4444');
    expect(corDoScore(0)).toBe('#ef4444');
  });
});
