/**
 * Custo IA do mês (H4 T10) — módulo PURO (zero I/O), testável em node.
 * Soma tokens das 4 fontes de uso de IA por report (`ia_usage`,
 * `kits_ia_usage`, `calendar_ia_usage`, `briefing_ia_usage` — os 4 campos
 * jsonb de `reports`, shape `IaUsage` de analyze-ia.ts) por org e no total,
 * com custo estimado em USD nos preços atuais do Opus. FECHA o follow-up do
 * H3: até aqui o custo só existia por report (`listOrgReports.iaUsage`,
 * um dos 4 campos), nunca consolidado por org/mês.
 *
 * Preço por 1M de tokens (Claude Opus, tabela pública Anthropic, jul/2026) —
 * revisar estas constantes se o modelo faturado mudar. O pipeline usa prompt
 * caching (`cache_control` em analyze-ia.ts e demais fontes de IA), então os
 * tokens de cache (leitura e escrita de 5min) entram no custo com os preços
 * próprios do Opus para cache — omiti-los subestima o gasto real.
 */
export const OPUS_INPUT_USD_PER_MTOK = 5;
export const OPUS_OUTPUT_USD_PER_MTOK = 25;
export const OPUS_CACHE_READ_USD_PER_MTOK = 0.5;
export const OPUS_CACHE_WRITE_USD_PER_MTOK = 6.25;

/** Shape solto do jsonb de usage — campos sempre opcionais/nuláveis (linhas antigas podem não ter algum campo). */
export type UsageJsonLike =
  | {
      input_tokens?: number | null;
      output_tokens?: number | null;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
      tentativas?: number | null;
    }
  | null
  | undefined;

export type ReportUsageRow = {
  orgId: string;
  iaUsage: UsageJsonLike;
  kitsIaUsage: UsageJsonLike;
  calendarIaUsage: UsageJsonLike;
  briefingIaUsage: UsageJsonLike;
};

export type CustoIaOrg = {
  orgId: string;
  inputTokens: number;
  outputTokens: number;
  /** Nº de idas à API somado das 4 fontes — usa `tentativas` quando presente (retentativas contam), senão 1 por fonte presente. */
  chamadas: number;
  custoUsd: number;
};

export type CustoIaTotal = { inputTokens: number; outputTokens: number; chamadas: number; custoUsd: number };

export type CustoIaMes = { porOrg: CustoIaOrg[]; total: CustoIaTotal };

const round2 = (n: number): number => Math.round(n * 100) / 100;

function custoUsd(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  return round2(
    (inputTokens / 1_000_000) * OPUS_INPUT_USD_PER_MTOK +
      (outputTokens / 1_000_000) * OPUS_OUTPUT_USD_PER_MTOK +
      (cacheReadTokens / 1_000_000) * OPUS_CACHE_READ_USD_PER_MTOK +
      (cacheWriteTokens / 1_000_000) * OPUS_CACHE_WRITE_USD_PER_MTOK,
  );
}

type Acumulador = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  chamadas: number;
};

/** Soma UMA das 4 fontes no acumulador da org; ausente/parcial vira 0, nunca lança. */
function somarFonte(acc: Acumulador, usage: UsageJsonLike): void {
  if (!usage) return;
  acc.inputTokens += Number(usage.input_tokens ?? 0);
  acc.outputTokens += Number(usage.output_tokens ?? 0);
  acc.cacheReadTokens += Number(usage.cache_read_input_tokens ?? 0);
  acc.cacheWriteTokens += Number(usage.cache_creation_input_tokens ?? 0);
  acc.chamadas += usage.tentativas != null ? Number(usage.tentativas) : 1;
}

/**
 * Soma tokens/chamadas/custo por org (e total) a partir das rows de reports
 * do mês (1 row por report, já filtrado pelo chamador ao período desejado).
 * Toda org com pelo menos 1 report na entrada aparece em `porOrg` — mesmo
 * zerada, quando as 4 fontes estão ausentes (relatório que nunca chegou a
 * chamar IA, ex.: falhou antes da etapa de análise) — não some do
 * consolidado, só some do total um valor que nunca existiu.
 */
export function custoIaDoMes(rows: ReportUsageRow[]): CustoIaMes {
  const porOrgAcc = new Map<string, Acumulador>();
  for (const row of rows) {
    const acc = porOrgAcc.get(row.orgId) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      chamadas: 0,
    };
    somarFonte(acc, row.iaUsage);
    somarFonte(acc, row.kitsIaUsage);
    somarFonte(acc, row.calendarIaUsage);
    somarFonte(acc, row.briefingIaUsage);
    porOrgAcc.set(row.orgId, acc);
  }

  const porOrg: CustoIaOrg[] = Array.from(porOrgAcc.entries())
    .map(([orgId, acc]) => ({
      orgId,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      chamadas: acc.chamadas,
      custoUsd: custoUsd(acc.inputTokens, acc.outputTokens, acc.cacheReadTokens, acc.cacheWriteTokens),
    }))
    .sort((a, b) => b.custoUsd - a.custoUsd || a.orgId.localeCompare(b.orgId, 'pt-BR'));

  // Total recomputado a partir dos tokens brutos somados dos acumuladores
  // originais (que incluem cache) — não da soma dos custoUsd já arredondados
  // por org — evita acumular erro de arredondamento.
  const totaisBrutos = Array.from(porOrgAcc.values()).reduce(
    (soma, acc) => ({
      inputTokens: soma.inputTokens + acc.inputTokens,
      outputTokens: soma.outputTokens + acc.outputTokens,
      cacheReadTokens: soma.cacheReadTokens + acc.cacheReadTokens,
      cacheWriteTokens: soma.cacheWriteTokens + acc.cacheWriteTokens,
      chamadas: soma.chamadas + acc.chamadas,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, chamadas: 0 },
  );
  const total: CustoIaTotal = {
    inputTokens: totaisBrutos.inputTokens,
    outputTokens: totaisBrutos.outputTokens,
    chamadas: totaisBrutos.chamadas,
    custoUsd: custoUsd(
      totaisBrutos.inputTokens,
      totaisBrutos.outputTokens,
      totaisBrutos.cacheReadTokens,
      totaisBrutos.cacheWriteTokens,
    ),
  };

  return { porOrg, total };
}
