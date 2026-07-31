import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import {
  listConnectionsExpirando,
} from '@/modules/connections/connection.repository';
import { listActiveErpConnections } from '@/modules/connections/active-provider.repository';
import type { ActiveErpRef } from '@/modules/orders/order-scope';
import {
  MARGEM_RENOVACAO_MS,
  renovarConexaoDaOrg,
} from '@/modules/connections/token-renewal';
import { registrarHeartbeat } from '@/modules/admin/heartbeat.repository';
import {
  LOTE_MAXIMO_SYNC,
  sincronizarPedidosDaOrg,
} from '@/modules/pipeline/sync-pedidos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** O kill switch limita somente a execução operacional de pedidos Olist. */
function podeSincronizarPedidos(source: ActiveErpRef): boolean {
  return source.provider !== 'olist'
    || (serverEnv.OLIST_DATA_SYNC_ENABLED && serverEnv.OLIST_DATA_SYNC_ORG_IDS.includes(source.orgId));
}

/**
 * Cron a cada 15 minutos (GitHub Actions manda `Authorization: Bearer CRON_SECRET`).
 * Passo 1: renova tokens expirando em <24h; Passo 2: sync incremental —
 * sincroniza os pedidos dos últimos 2 dias de cada ERP ativo,
 * mantendo `orders` vivo entre relatórios (meta mensal, alertas e "vendas de
 * ontem" deixam de ler uma foto congelada).
 *
 * Falha em UMA org (try/catch por org) não aborta o lote. Lote máx. 50 orgs.
 */
export async function GET(req: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET) {
    return Response.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  const agora = new Date();

  // Passo 1 (G0/Task 7): renovação proativa de tokens — RODA ANTES do sync
  // para que conexões renovadas sincronizem e as que viraram 'expirado' saiam
  // da lista. Falha em UMA conexão não aborta o lote. Falha transitória
  // (Bling fora do ar/rate limit) NÃO conta como expirada: a conexão continua
  // 'ok' e será re-tentada na próxima execução.
  let renovadas = 0;
  let expiradas = 0;
  let transientes = 0;
  for (const orgId of await listConnectionsExpirando(MARGEM_RENOVACAO_MS, agora)) {
    try {
      const resultado = await renovarConexaoDaOrg(orgId);
      if (resultado === 'renovada') renovadas++;
      else if (resultado === 'expirada') expiradas++;
      else transientes++;
      logger.info('cron.sincronizar_pedidos.token', { orgId, resultado });
    } catch (err) {
      // Erro inesperado: status/notificação NÃO aconteceram — trata como
      // transiente (re-tenta na próxima execução), nunca como expirada.
      transientes++;
      logger.error('cron.sincronizar_pedidos.token_erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const sources = (await listActiveErpConnections({ limit: LOTE_MAXIMO_SYNC })).filter(podeSincronizarPedidos);
  let sincronizadas = 0;
  let falhas = 0;
  let enriquecidos = 0;
  let pendentesRestantes = 0;
  const porProvider: Record<string, { orgs: number; sincronizadas: number; falhas: number }> = {};

  for (const source of sources) {
    const counters = (porProvider[source.provider] ??= { orgs: 0, sincronizadas: 0, falhas: 0 });
    counters.orgs++;
    try {
      const r = await sincronizarPedidosDaOrg(source, agora);
      sincronizadas++;
      counters.sincronizadas++;
      enriquecidos += r.enriquecimento.enriquecidos;
      if (r.enriquecimento.restantes > 0) pendentesRestantes += r.enriquecimento.restantes;
      logger.info('cron.sincronizar_pedidos.org', {
        orgId: source.orgId,
        provider: source.provider,
        processados: r.processados,
        total: r.total,
        enriquecidos: r.enriquecimento.enriquecidos,
        enriqFalhas: r.enriquecimento.falhas,
        enriqRestantes: r.enriquecimento.restantes,
      });
    } catch (err) {
      falhas++;
      counters.falhas++;
      logger.error('cron.sincronizar_pedidos.erro', {
        orgId: source.orgId,
        provider: source.provider,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const resposta = {
    orgs: sources.length,
    sincronizadas,
    falhas,
    renovadas,
    expiradas,
    transientes,
    enriquecidos,
    pendentesRestantes,
    porProvider,
  };
  await registrarHeartbeat('sincronizar-pedidos', true, resposta);
  return Response.json(resposta);
}
