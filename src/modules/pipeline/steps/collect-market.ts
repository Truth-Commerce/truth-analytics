import { db } from '@/db/client';
import { marketSnapshots } from '@/db/schema';
import { logger } from '@/lib/logger';
import { pLimit } from '@/lib/p-limit';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { mlPublicoProvider } from '@/modules/market/ml-publico';
import { serpapiProvider } from '@/modules/market/serpapi';
import type { MarketProvider, SnapshotDados } from '@/modules/market/market.types';

export type CollectMarketResult = { benchmarkParcial: boolean };

const CONCORRENCIA = 6;
const LOTE_INSERT = 100;

type SnapshotValues = {
  org_id: string;
  report_id: string;
  fonte: MarketProvider['fonte'];
  keyword: string;
  dados: SnapshotDados;
};

/**
 * Step 2: coleta de mercado paralelizada (limite 6) com bulk insert.
 * Degradação graciosa por job: falha de provedor/keyword marca benchmarkParcial
 * e segue — nunca derruba o pipeline.
 */
export async function collectMarket(
  orgId: string,
  reportId: string,
  providers: MarketProvider[] = [serpapiProvider, mlPublicoProvider],
): Promise<CollectMarketResult> {
  const allProducts = await listTrackedProducts(orgId);
  const activeProducts = allProducts.filter((p) => p.ativo === true);

  const jobs: { keyword: string; provider: MarketProvider }[] = [];
  for (const product of activeProducts) {
    for (const keyword of product.keywords.filter((k) => k.trim() !== '')) {
      for (const provider of providers) {
        jobs.push({ keyword, provider });
      }
    }
  }

  const limit = pLimit(CONCORRENCIA);
  let benchmarkParcial = false;
  const rows: SnapshotValues[] = [];

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        try {
          const result = await job.provider.search(job.keyword);
          rows.push({
            org_id: orgId,
            report_id: reportId,
            fonte: job.provider.fonte,
            keyword: job.keyword,
            dados: { precos: result.precos, quantidadeResultados: result.precos.length },
          });
        } catch (err) {
          benchmarkParcial = true;
          logger.warn(
            'provedor de mercado falhou',
            { orgId, reportId, fonte: job.provider.fonte, keyword: job.keyword },
            err,
          );
        }
      }),
    ),
  );

  for (let i = 0; i < rows.length; i += LOTE_INSERT) {
    await db.insert(marketSnapshots).values(rows.slice(i, i + LOTE_INSERT));
  }

  if (rows.length === 0) {
    benchmarkParcial = true;
  }
  return { benchmarkParcial };
}
