import { describe, expect, it } from 'vitest';

import { chartTheme, seriesColor } from '@/components/ui/charts/chart-theme';

describe('chart-theme', () => {
  it('usa o DNA visual Truth (grid vidro, verde neon, eixo AA)', () => {
    expect(chartTheme.grid).toBe('#ffffff0f');
    expect(chartTheme.brand).toBe('#07dd2b');
    expect(chartTheme.axis).toBe('#a1a1aa');
    expect(chartTheme.areaFrom).toBe('rgba(7,221,43,0.35)');
    expect(chartTheme.areaTo).toBe('rgba(7,221,43,0)');
  });

  it('seriesColor começa no verde e dá a volta na paleta', () => {
    expect(seriesColor(0)).toBe('#07dd2b');
    expect(seriesColor(chartTheme.series.length)).toBe('#07dd2b');
  });
});
