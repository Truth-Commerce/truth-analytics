/** Tema Recharts com o DNA visual Truth — usado por todos os charts. */
export const chartTheme = {
  grid: '#ffffff0f',
  axis: '#a1a1aa',
  brand: '#07dd2b',
  areaFrom: 'rgba(7,221,43,0.35)',
  areaTo: 'rgba(7,221,43,0)',
  series: ['#07dd2b', '#38bdf8', '#a78bfa', '#fbbf24', '#f87171', '#94a3b8'],
} as const;

export function seriesColor(i: number): string {
  return chartTheme.series[i % chartTheme.series.length];
}

/**
 * Cor do arco do Truth Score por faixa — alinhada aos tokens do tailwind
 * (brand / warning.DEFAULT / danger.DEFAULT). O #eab308 fora de token morreu aqui.
 */
export function corDoScore(score: number): string {
  if (score >= 70) return '#07dd2b';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}
