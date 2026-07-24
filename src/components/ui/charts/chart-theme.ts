/** Tema Recharts com o DNA visual Truth — usado por todos os charts. */
export const chartTheme = {
  grid: '#ded8cd',
  axis: '#6f685f',
  brand: '#137a3e',
  areaFrom: 'rgba(19,122,62,0.24)',
  areaTo: 'rgba(19,122,62,0)',
  series: ['#137a3e', '#267aa5', '#7957a8', '#b66a00', '#c93c37', '#6f685f'],
} as const;

export function seriesColor(i: number): string {
  return chartTheme.series[i % chartTheme.series.length];
}

/**
 * Cor do arco do Truth Score por faixa — alinhada aos tokens do tailwind
 * (brand / warning.DEFAULT / danger.DEFAULT). O amarelo fora de token morreu aqui.
 */
export function corDoScore(score: number): string {
  if (score >= 70) return '#137a3e';
  if (score >= 40) return '#b66a00';
  return '#c93c37';
}
