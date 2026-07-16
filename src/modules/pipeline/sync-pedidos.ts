import { collectBlingOrders, type CollectResult } from '@/modules/pipeline/steps/collect-bling';

/** Sync incremental cobre os últimos 2 dias (pedidos atrasados de ontem + hoje parcial). */
export const JANELA_SYNC_DIAS = 2;
/** Máx. de orgs sincronizadas por execução do cron (protege maxDuration=300s). */
export const LOTE_MAXIMO_SYNC = 50;

const DIA_MS = 86_400_000;

/**
 * Sincroniza os pedidos recentes de UMA org reutilizando a coleta idempotente
 * do pipeline (`collectBlingOrders` — upsert por (org_id, bling_order_id)).
 * Erros do Bling propagam — o chamador (cron) faz try/catch por org.
 */
export async function sincronizarPedidosDaOrg(orgId: string, agora: Date): Promise<CollectResult> {
  const periodo = { inicio: new Date(agora.getTime() - JANELA_SYNC_DIAS * DIA_MS), fim: agora };
  return collectBlingOrders(orgId, periodo);
}
