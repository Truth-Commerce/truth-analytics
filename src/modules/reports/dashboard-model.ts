import { formatBRL, formatDataCurta, formatDiaMes } from '@/lib/format';
import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { deltaNumero, fontesRelatorioCompativeis, totalPedidos, totalVendas } from '@/modules/reports/compare';
import { ordenarAchados } from '@/modules/reports/report-view-model';
import type { HistoricoDashboardRow } from '@/modules/reports/report.repository';
import type { ReportDetail } from '@/modules/reports/report.types';
import { tituloFromItem } from '@/modules/tasks/report-to-task';

const DIA_MS = 86_400_000;

/**
 * Countdown POSITIVO da próxima análise automática (reframe do bloqueio do
 * ciclo como serviço). Dias contados no calendário BRT — 22h de hoje até 1h
 * de amanhã (BRT) ainda é "hoje".
 */
export function proximaAnaliseInfo(
  geracaoAutomatica: boolean,
  proximoEm: Date | null,
  agora: Date = new Date(),
): { dias: number; data: string } | null {
  if (!geracaoAutomatica || !proximoEm || proximoEm.getTime() <= agora.getTime()) return null;
  const dias = Math.round(
    (inicioDeDiaUtc(hojeBrt(proximoEm)).getTime() - inicioDeDiaUtc(hojeBrt(agora)).getTime()) / DIA_MS,
  );
  return { dias, data: formatDiaMes(proximoEm) };
}

/** Copy pt-BR do countdown (0 = hoje; singular/plural). */
export function copyProximaAnalise(info: { dias: number; data: string }): string {
  if (info.dias <= 0) return `Sua próxima análise sai hoje (${info.data}).`;
  const unidade = info.dias === 1 ? 'dia' : 'dias';
  return `Sua próxima análise sai automaticamente em ${info.dias} ${unidade} (${info.data}).`;
}

/**
 * Fallback acessível do gráfico de evolução (sr-only): período, total e
 * melhor dia — o essencial que o gráfico comunica visualmente.
 */
export function srSummaryEvolucao(evolucao: { data: string; total: number }[]): string {
  if (evolucao.length === 0) return 'Sem dados de evolução de vendas no período.';
  const primeiro = evolucao[0];
  const ultimo = evolucao[evolucao.length - 1];
  const total = Math.round(evolucao.reduce((acc, e) => acc + e.total, 0) * 100) / 100;
  const melhor = evolucao.reduce((a, b) => (b.total > a.total ? b : a));
  return `Evolução diária de vendas de ${formatDataCurta(primeiro.data)} a ${formatDataCurta(ultimo.data)}: total de ${formatBRL(total)}; melhor dia ${formatDataCurta(melhor.data)} com ${formatBRL(melhor.total)}.`;
}

export type StatItemModel = {
  label: string;
  value: number;
  format: 'brl' | 'int' | 'pct';
  spark?: number[];
};

/**
 * Cards de stats do bento (pura). Substitui o antigo "Relatórios gerados"
 * (métrica de vaidade que congelava em 50 — LIST_LIMIT) por "Variação vs
 * análise anterior": deltaPct do total vs o done anterior, com fallback via
 * truth_score.totalPeriodoAnterior (mesma lógica do heroKpis da G1).
 * Sem base de comparação → devolve só 3 cards (nunca um número enganoso).
 */
export function statCardsModel(atual: Metricas, anterior: Metricas | null): StatItemModel[] {
  const itens: StatItemModel[] = [
    {
      label: 'Faturamento do período',
      value: totalVendas(atual),
      format: 'brl',
      spark: atual.evolucao.map((e) => e.total),
    },
    { label: 'Pedidos', value: totalPedidos(atual), format: 'int' },
    { label: 'Ticket médio', value: atual.ticketMedio, format: 'brl' },
  ];

  const ts = atual.truth_score;
  let deltaPct: number | null = null;
  if (anterior) {
    deltaPct = deltaNumero(totalVendas(atual), totalVendas(anterior)).deltaPct;
  } else if (ts && ts.totalPeriodoAnterior !== null && ts.totalPeriodoAnterior !== 0) {
    deltaPct = deltaNumero(ts.totalPeriodo, ts.totalPeriodoAnterior).deltaPct;
  }
  if (deltaPct !== null) {
    itens.push({ label: 'Variação vs análise anterior', value: deltaPct, format: 'pct' });
  }
  return itens;
}

export type LinhaDoTempoScore = { serie: number[]; texto: string | null };

function fonteValida(row: Pick<HistoricoDashboardRow, 'sourceProvider' | 'sourceGeneration'>): boolean {
  return fontesRelatorioCompativeis(row, row);
}

function fonteDoDoneMaisRecente(historico: HistoricoDashboardRow[]): HistoricoDashboardRow | null {
  return historico.find((row) => row.status === 'done' && fonteValida(row)) ?? null;
}

/**
 * Linha do tempo do Truth Score: todos os scores persistidos (F3a), em ordem
 * cronológica. O histórico chega DESC (query do dashboard) → reverte.
 * Texto só com ≥ 2 pontos ("De 58 para 76 em 4 relatórios").
 */
export function linhaDoTempoScore(historico: HistoricoDashboardRow[]): LinhaDoTempoScore {
  const referencia = fonteDoDoneMaisRecente(historico);
  if (!referencia) return { serie: [], texto: null };
  const serie = historico
    .filter((r) => r.status === 'done' && r.score !== null && fontesRelatorioCompativeis(r, referencia))
    .map((r) => r.score as number)
    .reverse();
  const texto =
    serie.length >= 2
      ? `De ${serie[0]} para ${serie[serie.length - 1]} em ${serie.length} relatórios`
      : null;
  return { serie, texto };
}

export type HistoricoLinha = HistoricoDashboardRow & {
  deltaScore: number | null;
  deltaFaturamento: number | null;
};

/**
 * Setas do histórico (pura): cada linha comparada ao done ANTERIOR mais
 * próximo que tenha o valor (failed e done sem truth_score são pulados na
 * base — a comparação é sempre relatório vs relatório, nunca vs buraco).
 * Input em ordem desc (como vem de listHistoricoDashboard).
 */
export function historicoComDeltas(historico: HistoricoDashboardRow[]): HistoricoLinha[] {
  return historico.map((row, i) => {
    let deltaScore: number | null = null;
    let deltaFaturamento: number | null = null;
    if (row.status !== 'done' || !fonteValida(row)) return { ...row, deltaScore, deltaFaturamento };
    for (let j = i + 1; j < historico.length; j++) {
      const prev = historico[j];
      if (prev.status !== 'done' || !fontesRelatorioCompativeis(row, prev)) continue;
      if (deltaScore === null && row.score !== null && prev.score !== null) {
        deltaScore = row.score - prev.score;
      }
      if (deltaFaturamento === null && row.totalPeriodo !== null && prev.totalPeriodo !== null) {
        deltaFaturamento = Math.round((row.totalPeriodo - prev.totalPeriodo) * 100) / 100;
      }
      if (deltaScore !== null && deltaFaturamento !== null) break;
    }
    return { ...row, deltaScore, deltaFaturamento };
  });
}

export type ChipRelatorio = { label: string; href: string };

const MAX_CHIPS = 3;

/**
 * Chips estáticos de atalho para as seções do último relatório done.
 * Substitui o marquee (WCAG 2.2.2 resolvido por não haver mais animação).
 * Âncoras estáveis da página do relatório: #metricas, #resumo, #recomendacoes.
 */
export function chipsDoRelatorio(latestDone: ReportDetail | null): ChipRelatorio[] {
  if (!latestDone || latestDone.status !== 'done' || !latestDone.metricas) return [];
  const base = `/dashboard/relatorios/${latestDone.id}`;
  const chips: ChipRelatorio[] = [{ label: 'Métricas do período', href: `${base}#metricas` }];
  const a = latestDone.analiseIa;
  if (a) {
    chips.push({ label: 'Análise da IA', href: `${base}#resumo` });
    const temRecomendacoes =
      (a.achados?.length ?? 0) > 0 ||
      a.gargalos.length > 0 ||
      a.sugestoesMelhoria.length > 0 ||
      a.ideiasVenda.length > 0;
    if (temRecomendacoes) chips.push({ label: 'Recomendações', href: `${base}#recomendacoes` });
  }
  return chips.slice(0, MAX_CHIPS);
}

export const TOP_PRODUTOS_DASHBOARD = 5;

export type TopProdutoDashboard = { nome: string; sku: string; receita: number };

/** Top 5 por receita — metricas.topProdutos JÁ vem ordenado desc do pipeline. */
export function topProdutosDashboard(m: Metricas | null): TopProdutoDashboard[] {
  if (!m) return [];
  return m.topProdutos
    .slice(0, TOP_PRODUTOS_DASHBOARD)
    .map((p) => ({ nome: p.nome, sku: p.sku, receita: p.receita }));
}

/** |Δ%| ≤ 2% da mediana de mercado conta como "na média". */
export const TOLERANCIA_NA_MEDIA_PCT = 2;

export type ResumoPosicaoPreco = {
  acima: number;
  abaixo: number;
  naMedia: number;
  total: number;
  leitura: string;
};

/**
 * Leitura leiga da posição de preço ("2 acima / 3 abaixo do mercado").
 * Itens com nossoPreco <= 0 ou mercado <= 0 são EXCLUÍDOS (P1 da auditoria:
 * "R$ 0,00" não é preço). Null sem nenhum item comparável.
 */
export function posicaoPrecoResumo(m: Metricas | null): ResumoPosicaoPreco | null {
  const itens = (m?.posicaoPreco ?? []).filter(
    (p) => p.nossoPreco > 0 && p.precoMercadoMediano > 0,
  );
  if (itens.length === 0) return null;
  let acima = 0;
  let abaixo = 0;
  let naMedia = 0;
  for (const p of itens) {
    const deltaPct = ((p.nossoPreco - p.precoMercadoMediano) / p.precoMercadoMediano) * 100;
    if (Math.abs(deltaPct) <= TOLERANCIA_NA_MEDIA_PCT) naMedia++;
    else if (deltaPct > 0) acima++;
    else abaixo++;
  }
  const basica = `${acima} acima / ${abaixo} abaixo do mercado`;
  return {
    acima,
    abaixo,
    naMedia,
    total: itens.length,
    leitura: naMedia > 0 ? `${basica} · ${naMedia} na média` : basica,
  };
}

export type AcaoPrincipal = {
  titulo: string;
  descricao: string | null;
  impactoBRL: number | null;
  fonte: 'achados' | 'gargalos';
  indice: number;
};

/**
 * "Ação nº 1": o achado da IA de maior impacto (ordem canônica da G1) ou,
 * em relatório antigo, gargalos[0]. `indice` é a posição ORIGINAL no array —
 * contrato do createTasksFromReportAction (itens: [{fonte, indice}]).
 * `titulo` passa por tituloFromItem (igual à task criada) para casar com a
 * checagem de jaExiste contra os títulos já persistidos.
 */
export function acaoNumeroUm(analise: AnaliseIa | null): AcaoPrincipal | null {
  if (!analise) return null;
  if (analise.achados && analise.achados.length > 0) {
    const { achado, indice } = ordenarAchados(analise.achados)[0];
    return {
      titulo: tituloFromItem(achado.titulo),
      descricao: achado.descricao,
      impactoBRL: achado.impactoEstimadoMensalBRL,
      fonte: 'achados',
      indice,
    };
  }
  if (analise.gargalos.length > 0) {
    return {
      titulo: tituloFromItem(analise.gargalos[0]),
      descricao: null,
      impactoBRL: null,
      fonte: 'gargalos',
      indice: 0,
    };
  }
  return null;
}
