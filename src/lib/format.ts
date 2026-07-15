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

function compacto(v: number): string {
  const s = (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  return s.endsWith(',0') ? s.slice(0, -2) : s;
}

/** Moeda compacta pt-BR para eixos de gráfico: "R$ 2k", "R$ 2,5k", "R$ 1,2M". */
export function formatBRLCompacto(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}R$ ${compacto(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}R$ ${compacto(abs / 1_000)}k`;
  return `${sign}R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(abs)}`;
}

/** 'yyyy-mm-dd' → 'dd/MM' por slicing puro — determinístico em server e client. */
export function formatDataCurta(isoDia: string): string {
  return `${isoDia.slice(8, 10)}/${isoDia.slice(5, 7)}`;
}

/** Date → 'dd/mm' em horário de Brasília (usar no SERVIDOR: e-mails, subject). */
export function formatDiaMes(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d);
}

/** Slug de nome para filenames: minúsculo, sem acentos, hífens. Vazio → 'cliente'. */
export function slugify(s: string): string {
  const slug = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'cliente';
}
