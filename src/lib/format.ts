/**
 * Formatadores puros pt-BR — sem I/O, sem dependências externas.
 *
 * Fusos (G0): instantes REAIS (created_at, expira_em, last_sync_at) são
 * exibidos em America/Sao_Paulo. Fronteiras de PERÍODO de relatório são
 * dias-calendário codificados em UTC (ver src/lib/timezone.ts) — formatar em
 * UTC para não deslocar o dia.
 */

export function formatBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatData(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
}

/** Dias-calendário codificados em UTC (fronteiras de período). */
export function formatDataUtc(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

export function formatPeriodo(inicio: Date | string, fim: Date | string): string {
  return `${formatDataUtc(inicio)} – ${formatDataUtc(fim)}`;
}
