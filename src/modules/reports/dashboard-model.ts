import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

export type DashboardStats = {
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  evolucaoTotais: number[];
};

/** Agregados do bento a partir das métricas do último relatório done (pura). */
export function dashboardStats(m: Metricas): DashboardStats {
  return {
    faturamento: m.vendasPorCanal.reduce((s, v) => s + v.total, 0),
    pedidos: m.vendasPorCanal.reduce((s, v) => s + v.pedidos, 0),
    ticketMedio: m.ticketMedio,
    evolucaoTotais: m.evolucao.map((e) => e.total),
  };
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
