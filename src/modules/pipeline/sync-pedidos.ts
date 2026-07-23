import { collectBlingOrders, type CollectResult } from '@/modules/pipeline/steps/collect-bling';
import { enrichOrders, type EnrichResult } from '@/modules/pipeline/steps/enrich-orders';

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
export const ENRIQUECIMENTO_SYNC = { maxPedidos: 200, prazoMs: 70_000 } as const;

const DIA_MS = 86_400_000;

export type SyncResult = CollectResult & { enriquecimento: EnrichResult };

/**
 * Sincroniza os pedidos recentes de UMA org reutilizando a coleta idempotente
 * do pipeline (`collectBlingOrders` — upsert por (org_id, bling_order_id)) e, em
 * seguida, lê o detalhe dos pedidos ainda sem itens/frete/comissão.
 *
 * Erros da COLETA propagam — o chamador (cron) faz try/catch por org.
 * O enriquecimento é best-effort e nunca lança.
 */
export async function sincronizarPedidosDaOrg(orgId: string, agora: Date): Promise<SyncResult> {
  const periodo = { inicio: new Date(agora.getTime() - JANELA_SYNC_DIAS * DIA_MS), fim: agora };
  const coleta = await collectBlingOrders(orgId, periodo);
  // Sem `periodo`: aqui a fila inteira é elegível, para o histórico atrasado
  // também andar todo dia — e não só a janela de 2 dias do sync.
  const enriquecimento = await enrichOrders(orgId, ENRIQUECIMENTO_SYNC);
  return { ...coleta, enriquecimento };
}
