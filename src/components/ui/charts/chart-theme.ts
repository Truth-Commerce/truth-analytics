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
