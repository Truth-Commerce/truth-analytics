import { serverEnv } from '@/lib/env';
import type { MarketProvider, MarketResult } from './market.types';

class SerpapiProvider implements MarketProvider {
  readonly fonte = 'serpapi' as const;

  async search(keyword: string): Promise<MarketResult> {
    if (!serverEnv.SERPAPI_KEY) {
      throw new Error('serpapi_nao_configurada');
    }

    const params = new URLSearchParams({
      engine: 'google_shopping',
      q: keyword,
      api_key: serverEnv.SERPAPI_KEY,
      hl: 'pt',
      gl: 'br',
      num: '20',
    });

    const url = `${serverEnv.SERPAPI_BASE}/search?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`serpapi_erro_${response.status}`);
    }

    const bruto = (await response.json()) as Record<string, unknown>;

    const shoppingResults = Array.isArray(bruto['shopping_results'])
      ? (bruto['shopping_results'] as Record<string, unknown>[])
      : [];

    const precos: number[] = shoppingResults
      .map((item) => {
        // Prefer o campo numérico limpo do SerpAPI quando presente.
        const extracted = item['extracted_price'];
        if (typeof extracted === 'number') return extracted;

        const priceRaw = item['price'];
        if (typeof priceRaw === 'number') return priceRaw;
        if (typeof priceRaw === 'string') {
          // Formato pt-BR "R$ 1.299,90": descarta tudo que não é dígito/vírgula
          // (incluindo o ponto separador de milhar) e usa a vírgula como decimal.
          const cleaned = priceRaw.replace(/[^0-9,]/g, '').replace(',', '.');
          const val = parseFloat(cleaned);
          return isNaN(val) ? null : val;
        }
        return null;
      })
      .filter((v): v is number => v !== null && v > 0);

    return { precos, bruto };
  }
}

export const serpapiProvider: MarketProvider = new SerpapiProvider();
