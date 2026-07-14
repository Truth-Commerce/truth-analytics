import { db } from '@/db/client';
import { marketSnapshots } from '@/db/schema';
import { serverEnv } from '@/lib/env';
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
 * Providers ATIVOS pela configuração: SERPAPI só entra se SERPAPI_KEY estiver
 * presente (sem chave, o provider lança 'serpapi_nao_configurada' em toda
 * keyword e benchmarkParcial ficava eternamente true — P0-7). Avaliado por
 * chamada (não em module-load) p/ testes conseguirem mockar o env.
 */
export function providersAtivos(): MarketProvider[] {
  return serverEnv.SERPAPI_KEY ? [serpapiProvider, mlPublicoProvider] : [mlPublicoProvider];
}

/**
 * Step 2: coleta de mercado paralelizada (limite 6) com bulk insert.
 * Degradação graciosa por job: benchmarkParcial=true só quando um provider ATIVO
 * falha (ou zero snapshots no total) e segue — nunca derruba o pipeline. SERPAPI
 * ausente não entra na lista de jobs, logo não pune o relatório.
 */
export async function collectMarket(
  orgId: string,
  reportId: string,
  providers: MarketProvider[] = providersAtivos(),
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
    try {
      await db.insert(marketSnapshots).values(rows.slice(i, i + LOTE_INSERT));
    } catch (err) {
      // Semântica graciosa preservada: falha de gravação marca parcial e segue
      // com os lotes restantes — nunca derruba a coleta (como no código
      // anterior, que capturava por operação de insert).
      benchmarkParcial = true;
      logger.warn('market_insert_falhou', { orgId, reportId, batch: i }, err);
    }
  }

  if (rows.length === 0) {
    benchmarkParcial = true;
  }
  return { benchmarkParcial };
}
