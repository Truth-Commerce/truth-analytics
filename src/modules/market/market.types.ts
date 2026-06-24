export interface MarketProvider {
  readonly fonte: 'serpapi' | 'ml_publico';
  search(keyword: string): Promise<MarketResult>;
}

export type MarketResult = { precos: number[]; bruto: unknown };
