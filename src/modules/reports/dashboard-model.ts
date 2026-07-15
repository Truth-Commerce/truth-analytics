import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { deltaNumero, totalPedidos, totalVendas } from '@/modules/reports/compare';
import { ordenarAchados } from '@/modules/reports/report-view-model';
import type { ReportDetail } from '@/modules/reports/report.types';
import { tituloFromItem } from '@/modules/tasks/report-to-task';

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
