/**
 * Calendário America/Sao_Paulo — helpers PUROS, sem libs novas.
 *
 * Regra da casa (G0): o fuso BRT decide QUAL dia-calendário é "hoje/ontem";
 * as FRONTEIRAS são codificadas em UTC (00:00:00.000Z / 23:59:59.999Z) porque
 * `orders.data` vem do Bling como data pura (meia-noite UTC). Brasil não tem
 * horário de verão desde 2019 — aritmética de dias em ms é segura.
 */

const DIA_MS = 86_400_000;

// en-CA formata como YYYY-MM-DD — exatamente o formato de chave que usamos.
const fmtBrt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia-calendário (YYYY-MM-DD) de um instante no fuso America/Sao_Paulo. */
export function hojeBrt(agora: Date = new Date()): string {
  return fmtBrt.format(agora);
}

/**
 * `true` só se `s` for um dia-calendário YYYY-MM-DD REAL. O regex sozinho
 * (`/^\d{4}-\d{2}-\d{2}$/`) aceita '2026-13-99', que vira erro de `date` no
 * Postgres → 500. Valida por round-trip em UTC (mês/dia têm de bater após a
 * normalização — '2026-02-30' vira 02-mar e é rejeitado).
 */
export function isDataCalendarioValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Dia-calendário de ontem no fuso America/Sao_Paulo. */
export function ontemBrt(agora: Date = new Date()): string {
  const hoje = hojeBrt(agora);
  return new Date(new Date(`${hoje}T00:00:00.000Z`).getTime() - DIA_MS)
    .toISOString()
    .slice(0, 10);
}

/** 00:00:00.000Z do dia-calendário (fronteira inferior de um dia fechado). */
export function inicioDeDiaUtc(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}

/** 23:59:59.999Z do dia-calendário (fronteira superior de um dia fechado). */
export function fimDeDiaUtc(data: string): Date {
  return new Date(`${data}T23:59:59.999Z`);
}

/**
 * Janela de `dias` dias FECHADOS terminando ontem (calendário BRT):
 * fim = ontem 23:59:59.999Z; inicio = (ontem − (dias−1)) 00:00:00.000Z.
 * O 1º dia entra inteiro; hoje (parcial) fica fora.
 */
export function janelaDiasFechados(
  dias: number,
  agora: Date = new Date(),
): { inicio: Date; fim: Date } {
  const ontem = ontemBrt(agora);
  const fim = fimDeDiaUtc(ontem);
  const inicio = new Date(inicioDeDiaUtc(ontem).getTime() - (dias - 1) * DIA_MS);
  return { inicio, fim };
}
