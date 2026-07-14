import type { Achado, AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { deltaNumero, totalPedidos, totalVendas } from '@/modules/reports/compare';

export type Prioridade = 'alta' | 'media' | 'baixa';

export type HeroKpis = {
  total: { valor: number; deltaPct: number | null };
  pedidos: { valor: number; deltaPct: number | null };
  ticket: { valor: number; deltaPct: number | null };
  score: { valor: number; deltaAbs: number | null } | null;
};

/**
 * KPIs do hero do relatório. Delta preferencial = comparação com o done
 * ANTERIOR; fallback do total = truth_score.totalPeriodoAnterior (mesma
 * duração, computado no pipeline) quando não há relatório anterior.
 */
export function heroKpis(atual: Metricas, anterior: Metricas | null): HeroKpis {
  const ts = atual.truth_score;
  const totalAtual = ts?.totalPeriodo ?? totalVendas(atual);
  let totalDelta: number | null = null;
  if (anterior) {
    totalDelta = deltaNumero(
      totalAtual,
      anterior.truth_score?.totalPeriodo ?? totalVendas(anterior),
    ).deltaPct;
  } else if (ts && ts.totalPeriodoAnterior !== null && ts.totalPeriodoAnterior !== 0) {
    totalDelta = deltaNumero(ts.totalPeriodo, ts.totalPeriodoAnterior).deltaPct;
  }
  return {
    total: { valor: totalAtual, deltaPct: totalDelta },
    pedidos: {
      valor: totalPedidos(atual),
      deltaPct: anterior ? deltaNumero(totalPedidos(atual), totalPedidos(anterior)).deltaPct : null,
    },
    ticket: {
      valor: atual.ticketMedio,
      deltaPct: anterior ? deltaNumero(atual.ticketMedio, anterior.ticketMedio).deltaPct : null,
    },
    score: ts
      ? { valor: ts.score, deltaAbs: anterior?.truth_score ? ts.score - anterior.truth_score.score : null }
      : null,
  };
}

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export type RecomendacaoCard = {
  texto: string;
  prioridade: Prioridade;
  origem: 'gargalo' | 'sugestao' | 'ideia';
};

/**
 * Prioridade derivada da origem (o schema da IA não tem campo prioridade —
 * gargalo é o que trava vendas hoje, sugestão melhora, ideia expande).
 */
export function recomendacaoCards(a: AnaliseIa): RecomendacaoCard[] {
  return [
    ...a.gargalos.map<RecomendacaoCard>((texto) => ({ texto, prioridade: 'alta', origem: 'gargalo' })),
    ...a.sugestoesMelhoria.map<RecomendacaoCard>((texto) => ({ texto, prioridade: 'media', origem: 'sugestao' })),
    ...a.ideiasVenda.map<RecomendacaoCard>((texto) => ({ texto, prioridade: 'baixa', origem: 'ideia' })),
  ];
}

const PRIORIDADE_PESO: Record<'alta' | 'media' | 'baixa', number> = { alta: 0, media: 1, baixa: 2 };

export type AchadoOrdenado = { achado: Achado; indice: number };

/**
 * Ordenação canônica de achados (cards, PDF, "gargalo nº 1" do e-mail):
 * impacto R$ desc (null por último) → prioridade alta>média>baixa → título asc.
 * `indice` preserva a posição ORIGINAL (o form achado→task referencia por índice).
 */
export function ordenarAchados(achados: Achado[]): AchadoOrdenado[] {
  return achados
    .map((achado, indice) => ({ achado, indice }))
    .sort((a, b) => {
      const ia = a.achado.impactoEstimadoMensalBRL ?? -1;
      const ib = b.achado.impactoEstimadoMensalBRL ?? -1;
      if (ib !== ia) return ib - ia;
      const pa = PRIORIDADE_PESO[a.achado.prioridade];
      const pb = PRIORIDADE_PESO[b.achado.prioridade];
      if (pa !== pb) return pa - pb;
      return a.achado.titulo.localeCompare(b.achado.titulo, 'pt-BR');
    });
}

/** Gargalo nº 1: melhor achado (ordem canônica) ou gargalos[0] em relatório antigo. */
export function primeiroGargalo(analise: AnaliseIa): string | null {
  if (analise.achados && analise.achados.length > 0) {
    return ordenarAchados(analise.achados)[0].achado.titulo;
  }
  return analise.gargalos[0] ?? null;
}
