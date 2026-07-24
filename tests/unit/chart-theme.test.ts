import { describe, expect, it } from 'vitest';

import { chartTheme, seriesColor } from '@/components/ui/charts/chart-theme';

describe('chart-theme', () => {
  it('mantém grid, eixo e área legíveis sobre o papel claro', () => {
    expect(chartTheme.grid).toBe('#ded8cd');
    expect(chartTheme.brand).toBe('#137a3e');
    expect(chartTheme.axis).toBe('#6f685f');
    expect(chartTheme.areaFrom).toBe('rgba(19,122,62,0.24)');
    expect(chartTheme.areaTo).toBe('rgba(19,122,62,0)');
  });

  it('seriesColor começa no verde e dá a volta na paleta', () => {
    expect(seriesColor(0)).toBe('#137a3e');
    expect(seriesColor(chartTheme.series.length)).toBe('#137a3e');
  });
});
