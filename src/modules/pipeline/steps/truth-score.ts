import type { Metricas, TruthScore } from '@/modules/pipeline/contracts';

export type TruthScoreInput = {
  totalPeriodo: number;
  /** null = sem base de comparação (primeiro relatório da org) */
  totalPeriodoAnterior: number | null;
  vendasPorCanal: Metricas['vendasPorCanal'];
  evolucao: Metricas['evolucao'];
  posicaoPreco: Metricas['posicaoPreco'];
  diasPeriodo: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Truth Score 0–100 — saúde da operação. Pesos:
 *  - crescimento vs período anterior ....... 25 (−20%→0, 0%→13, +20%→25; sem base → 15 neutros)
 *  - posição de preço vs mercado ........... 25 (ratio ≤1.05→1.0, ≤1.20→0.6, >1.20→0.2; sem itens → 15)
 *  - diversificação de canais .............. 20 (0→0, 1→8, 2→14, 3+→20)
 *  - regularidade de vendas ................ 20 (dias com venda / dias do período)
 *  - cobertura de benchmark ................ 10 (produtos com mediana de mercado / monitorados; sem produtos → 5)
 * Função pura — sem I/O.
 */
export function computeTruthScore(input: TruthScoreInput): TruthScore {
  // 1. Crescimento (25)
  let variacaoPercentual: number | null = null;
  let crescimentoPts = 15;
  if (input.totalPeriodoAnterior !== null && input.totalPeriodoAnterior > 0) {
    const variacao = (input.totalPeriodo - input.totalPeriodoAnterior) / input.totalPeriodoAnterior;
    variacaoPercentual = Math.round(variacao * 10000) / 100;
    crescimentoPts = clamp(Math.round(((variacao + 0.2) / 0.4) * 25), 0, 25);
  }

  // 2. Posição de preço (25)
  const avaliaveis = input.posicaoPreco.filter((p) => p.nossoPreco > 0 && p.precoMercadoMediano > 0);
  let precoPts = 15;
  if (avaliaveis.length > 0) {
    const soma = avaliaveis.reduce((acc, p) => {
      const ratio = p.nossoPreco / p.precoMercadoMediano;
      return acc + (ratio <= 1.05 ? 1 : ratio <= 1.2 ? 0.6 : 0.2);
    }, 0);
    precoPts = clamp(Math.round((soma / avaliaveis.length) * 25), 0, 25);
  }

  // 3. Diversificação de canais (20)
  const canaisComVenda = input.vendasPorCanal.filter((c) => c.total > 0).length;
  const diversificacaoPts =
    canaisComVenda === 0 ? 0 : canaisComVenda === 1 ? 8 : canaisComVenda === 2 ? 14 : 20;

  // 4. Regularidade (20)
  const diasComVenda = input.evolucao.filter((e) => e.total > 0).length;
  const regularidadePts =
    input.diasPeriodo <= 0 ? 0 : clamp(Math.round((diasComVenda / input.diasPeriodo) * 20), 0, 20);

  // 5. Cobertura de benchmark (10)
  const produtosAvaliados = input.posicaoPreco.length;
  const produtosComBenchmark = input.posicaoPreco.filter((p) => p.precoMercadoMediano > 0).length;
  const coberturaPts =
    produtosAvaliados === 0
      ? 5
      : clamp(Math.round((produtosComBenchmark / produtosAvaliados) * 10), 0, 10);

  return {
    score: crescimentoPts + precoPts + diversificacaoPts + regularidadePts + coberturaPts,
    totalPeriodo: input.totalPeriodo,
    totalPeriodoAnterior: input.totalPeriodoAnterior,
    fatores: {
      crescimento: { pontos: crescimentoPts, max: 25, variacaoPercentual },
      posicaoPreco: { pontos: precoPts, max: 25, itensAvaliados: avaliaveis.length },
      diversificacao: { pontos: diversificacaoPts, max: 20, canaisComVenda },
      regularidade: { pontos: regularidadePts, max: 20, diasComVenda, diasPeriodo: input.diasPeriodo },
      cobertura: { pontos: coberturaPts, max: 10, produtosComBenchmark, produtosAvaliados },
    },
  };
}
