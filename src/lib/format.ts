/**
 * Formatadores puros pt-BR — sem I/O, sem dependências externas.
 */

export function formatBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatData(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

export function formatPeriodo(inicio: Date | string, fim: Date | string): string {
  return `${formatData(inicio)} – ${formatData(fim)}`;
}
