import type { Metricas } from '@/modules/pipeline/contracts';

export type ProgressoMeta = { percentual: number; restante: number; atingida: boolean };

/** Pura. meta null/≤0 → null (sem meta definida). percentual inteiro, cap 999. */
export function progressoMeta(totalMes: number, meta: number | null): ProgressoMeta | null {
  if (meta === null || meta <= 0) return null;
  return {
    percentual: Math.min(999, Math.round((totalMes / meta) * 100)),
    restante: Math.max(0, Math.round((meta - totalMes) * 100) / 100),
    atingida: totalMes >= meta,
  };
}

export type DeltaNumero = {
  atual: number;
  anterior: number;
  deltaAbs: number;
  /** % com 1 casa; null quando anterior = 0 (divisão indefinida). */
  deltaPct: number | null;
};

/** Pura. deltaPct null quando `anterior` = 0 (divisão indefinida). */
export function deltaNumero(atual: number, anterior: number): DeltaNumero {
  return {
    atual,
    anterior,
    deltaAbs: Math.round((atual - anterior) * 100) / 100,
    deltaPct: anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 1000) / 10,
  };
}

/** Soma o total de vendas de `evolucao` (fonte de verdade do total do período). */
export function totalVendas(m: Metricas): number {
  return Math.round(m.evolucao.reduce((acc, e) => acc + e.total, 0) * 100) / 100;
}

/** Soma os pedidos de todos os canais. */
export function totalPedidos(m: Metricas): number {
  return m.vendasPorCanal.reduce((acc, c) => acc + c.pedidos, 0);
}

export type ComparacaoRelatorios = {
  totalVendas: DeltaNumero;
  pedidos: DeltaNumero;
  ticketMedio: DeltaNumero;
  truthScore: DeltaNumero | null; // null se algum lado não tiver score
  porCanal: { canal: string; delta: DeltaNumero }[];
};

/** Pura. `atual` = relatório mais recente (A); `anterior` = base de comparação (B). */
export function compararMetricas(atual: Metricas, anterior: Metricas): ComparacaoRelatorios {
  const canais = new Map<string, { a: number; b: number }>();
  for (const c of atual.vendasPorCanal) canais.set(c.canal, { a: c.total, b: 0 });
  for (const c of anterior.vendasPorCanal) {
    const cur = canais.get(c.canal) ?? { a: 0, b: 0 };
    canais.set(c.canal, { ...cur, b: c.total });
  }
  const scoreA = atual.truth_score?.score;
  const scoreB = anterior.truth_score?.score;
  return {
    totalVendas: deltaNumero(totalVendas(atual), totalVendas(anterior)),
    pedidos: deltaNumero(totalPedidos(atual), totalPedidos(anterior)),
    ticketMedio: deltaNumero(atual.ticketMedio, anterior.ticketMedio),
    truthScore: scoreA !== undefined && scoreB !== undefined ? deltaNumero(scoreA, scoreB) : null,
    porCanal: Array.from(canais.entries())
      .map(([canal, v]) => ({ canal, delta: deltaNumero(v.a, v.b) }))
      .sort((x, y) => y.delta.atual - x.delta.atual || x.canal.localeCompare(y.canal, 'pt-BR')),
  };
}
