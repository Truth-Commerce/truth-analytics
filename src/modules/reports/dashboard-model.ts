import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { deltaNumero, totalPedidos, totalVendas } from '@/modules/reports/compare';

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

const MAX_INSIGHTS = 8;

/** Frases curtas para o marquee, na ordem gargalo → sugestão → ideia (pura). */
export function insightsFromAnalise(a: AnaliseIa | null): string[] {
  if (!a) return [];
  return [
    ...a.gargalos.map((g) => `Gargalo: ${g}`),
    ...a.sugestoesMelhoria.map((s) => `Sugestão: ${s}`),
    ...a.ideiasVenda.map((i) => `Ideia: ${i}`),
  ].slice(0, MAX_INSIGHTS);
}
