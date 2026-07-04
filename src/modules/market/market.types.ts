export interface MarketProvider {
  readonly fonte: 'serpapi' | 'ml_publico';
  search(keyword: string): Promise<MarketResult>;
}

/** Resultado de busca: só os preços — o payload bruto NÃO é mais retido (poda de storage). */
export type MarketResult = { precos: number[] };

/** Shape persistido em market_snapshots.dados a partir da F0. */
export type SnapshotDados = { precos: number[]; quantidadeResultados: number };
