import { db } from '@/db/client';
import { marketSnapshots } from '@/db/schema';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { mlPublicoProvider } from '@/modules/market/ml-publico';
import { serpapiProvider } from '@/modules/market/serpapi';
import type { MarketProvider } from '@/modules/market/market.types';
import { logger } from '@/lib/logger';

export type CollectMarketResult = { benchmarkParcial: boolean };

export async function collectMarket(
  orgId: string,
  reportId: string,
  providers: MarketProvider[] = [serpapiProvider, mlPublicoProvider],
): Promise<CollectMarketResult> {
  const allProducts = await listTrackedProducts(orgId);
  const activeProducts = allProducts.filter((p) => p.ativo === true);

  let benchmarkParcial = false;
  let totalSnapshots = 0;

  for (const product of activeProducts) {
    const keywords = product.keywords.filter((k) => k.trim() !== '');

    for (const keyword of keywords) {
      for (const provider of providers) {
        try {
          const result = await provider.search(keyword);

          await db.insert(marketSnapshots).values({
            org_id: orgId,
            report_id: reportId,
            fonte: provider.fonte,
            keyword,
            dados: result,
          });

          totalSnapshots++;
        } catch (err) {
          benchmarkParcial = true;
          logger.warn(
            'provedor de mercado falhou',
            { orgId, reportId, fonte: provider.fonte, keyword },
            err,
          );
        }
      }
    }
  }

  if (totalSnapshots === 0) {
    benchmarkParcial = true;
  }

  return { benchmarkParcial };
}
