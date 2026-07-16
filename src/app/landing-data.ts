/**
 * Dados da landing — números APENAS verificáveis no produto (zero métricas
 * inventadas de clientes/receita). Extraídos p/ um módulo puro (server-safe)
 * para poderem ser testados sem renderizar React.
 */

/** Faixa de números do produto (count-up honesto): 100 pts de score, 3 passos, 1 min. */
export const LANDING_METRICAS = [
  { alvo: 100, label: 'Truth Score — sua loja avaliada de 0 a 100' },
  { alvo: 3, label: 'passos até a primeira análise' },
  { alvo: 1, label: 'minuto para conectar o Bling' },
] as const;

/** Canais de venda que chegam pelo Bling (marquee). */
export const LANDING_CANAIS = [
  'Mercado Livre',
  'Shopee',
  'Amazon',
  'Magalu',
  'Americanas',
  'Casas Bahia',
  'Shein',
  'Loja própria',
] as const;
