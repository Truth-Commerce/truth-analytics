import type { MarketProvider, MarketResult } from './market.types';

const ML_SEARCH_BASE = 'https://api.mercadolibre.com/sites/MLB/search';

class MlPublicoProvider implements MarketProvider {
  readonly fonte = 'ml_publico' as const;

  async search(keyword: string): Promise<MarketResult> {
    const params = new URLSearchParams({
      q: keyword,
      limit: '20',
    });

    const url = `${ML_SEARCH_BASE}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`ml_publico_erro_${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;

    const results = Array.isArray(payload['results'])
      ? (payload['results'] as Record<string, unknown>[])
      : [];

    const precos: number[] = results
      .map((item) => {
        const price = item['price'];
        if (typeof price === 'number' && price > 0) return price;
        return null;
      })
      .filter((v): v is number => v !== null);

    return { precos };
  }
}

export const mlPublicoProvider: MarketProvider = new MlPublicoProvider();
