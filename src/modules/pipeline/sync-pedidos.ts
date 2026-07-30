import { getLastSyncAtForSource, touchLastSyncAtForSource } from '@/modules/connections/provider-connection.repository';
import { collectBlingOrders, type CollectResult } from '@/modules/pipeline/steps/collect-bling';
import { collectOrders } from '@/modules/pipeline/steps/collect-orders';
import { enrichOrders, type EnrichResult } from '@/modules/pipeline/steps/enrich-orders';
import type { ErpDataSource } from '@/modules/providers/data.types';

/** Sync incremental cobre os últimos 2 dias (pedidos atrasados de ontem + hoje parcial). */
export const JANELA_SYNC_DIAS = 2;
/** Máx. de orgs sincronizadas por execução do cron (protege maxDuration=300s). */
export const LOTE_MAXIMO_SYNC = 50;

/**
 * Orçamento do enriquecimento por org no cron diário. Dimensionado para o regime
 * permanente (poucas dezenas de pedidos novos/dia) com folga para ir comendo o
 * histórico atrasado aos poucos. O backfill inicial não passa por aqui — é o
 * script `.superpowers/sdd/backfill-detalhes.mjs`, que roda sem timeout.
 */
export const ENRIQUECIMENTO_SYNC_BLING = { maxPedidos: 200, prazoMs: 70_000 } as const;
export const ENRIQUECIMENTO_SYNC_OLIST = { maxPedidos: 100, prazoMs: 240_000 } as const;
/** @deprecated Use the provider-specific budget. */
export const ENRIQUECIMENTO_SYNC = ENRIQUECIMENTO_SYNC_BLING;

const DIA_MS = 86_400_000;

export type SyncResult = CollectResult & { enriquecimento: EnrichResult };

/**
 * Sincroniza pedidos recentes de UMA org pela fonte operacional recebida e, em
 * seguida, lê o detalhe dos pedidos ainda sem itens/frete/comissão.
 *
 * Erros da COLETA propagam — o chamador (cron) faz try/catch por org.
 * O enriquecimento é best-effort e nunca lança.
 */
export async function sincronizarPedidosDaOrg(source: ErpDataSource, agora: Date): Promise<SyncResult> {
  const periodoBling = { inicio: new Date(agora.getTime() - JANELA_SYNC_DIAS * DIA_MS), fim: agora };
  const isOlist = source.provider === 'olist';
  // Olist é incremental pela data de atualização. O overlap de cinco minutos
  // absorve paginação/latência sem depender de um filtro de criação.
  const lastSuccessAt = isOlist
    ? await getLastSyncAtForSource(source)
    : (source as ErpDataSource & { lastSyncAt?: Date | null }).lastSyncAt;
  // A primeira carga Olist é responsabilidade explícita do backfill (Task 10).
  // Sem um sucesso anterior não há watermark confiável; não inferimos uma janela
  // de criação nem marcamos frescor para não esconder histórico ausente.
  if (isOlist && !lastSuccessAt) throw new Error('olist_incremental_baseline_missing');
  const updatedAfter = isOlist
    ? new Date(lastSuccessAt!.getTime() - 5 * 60_000)
    : undefined;
  const coleta = isOlist
    ? await collectOrders(source, periodoBling, { updatedAfter })
    : await collectBlingOrders(source.orgId, periodoBling);
  if (isOlist && !('incompleto' in coleta && coleta.incompleto)) await touchLastSyncAtForSource(source, agora);
  // Sem `periodo`: aqui a fila inteira é elegível, para o histórico atrasado
  // também andar todo dia — e não só a janela de 2 dias do sync.
  const enriquecimento = await enrichOrders(source, isOlist ? ENRIQUECIMENTO_SYNC_OLIST : ENRIQUECIMENTO_SYNC_BLING);
  return { ...coleta, enriquecimento };
}
