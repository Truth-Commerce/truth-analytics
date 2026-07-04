import type { AnaliseIa } from '@/modules/pipeline/contracts';

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
