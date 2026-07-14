/** Alerta de queda: total 7d < 50% da média semanal das 4 semanas anteriores. */
export const QUEDA_VENDAS_LIMIAR = 0.5;
/** Severidade crítica: total 7d < 30% da média. */
export const QUEDA_VENDAS_CRITICO = 0.3;
/** Média semanal mínima (R$) para a base ser confiável — abaixo disso não alerta (ruído). */
export const QUEDA_BASE_MINIMA_SEMANAL = 100;
/** Mercado ≥ 5% abaixo do nosso preço → alerta. */
export const CONCORRENTE_MARGEM_MINIMA = 0.05;
/** Diferença ≥ 15% → severidade crítica. */
export const CONCORRENTE_CRITICO_PCT = 15;
/** Produto monitorado sem venda há 14+ dias → alerta. */
export const PRODUTO_PARADO_DIAS = 14;
/** Só alerta produto que vendeu ao menos 1x nos últimos 90 dias (senão nunca vendeu — não é "parado"). */
export const PRODUTO_HISTORICO_DIAS = 90;
/** Verificação roda só p/ orgs com relatório done nos últimos 45 dias. */
export const JANELA_RELATORIO_RECENTE_DIAS = 45;
/** Cooldown pós-resolução: alerta resolvido não renasce por 7 dias (dedup por tipo+chave). */
export const ALERTA_COOLDOWN_DIAS = 7;
