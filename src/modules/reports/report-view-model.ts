import type { Achado, AnaliseIa } from '@/modules/pipeline/contracts';

export type Prioridade = 'alta' | 'media' | 'baixa';

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
