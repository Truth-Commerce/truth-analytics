import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import {
  listConnectionsExpirando,
  listOrgsComBlingOk,
} from '@/modules/connections/connection.repository';
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

/**
 * Cron diário (7h UTC — Vercel manda `Authorization: Bearer CRON_SECRET`).
 * Passo 1: renova tokens expirando em <24h; Passo 2: sync incremental —
 * sincroniza os pedidos dos últimos 2 dias de cada org com conexão Bling ok,
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
  // 'ok' e será re-tentada no próximo cron.
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
      // transiente (re-tenta amanhã), nunca como expirada.
      transientes++;
      logger.error('cron.sincronizar_pedidos.token_erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const orgIds = (await listOrgsComBlingOk()).slice(0, LOTE_MAXIMO_SYNC);
  let sincronizadas = 0;
  let falhas = 0;

  for (const orgId of orgIds) {
    try {
      const r = await sincronizarPedidosDaOrg(orgId, agora);
      sincronizadas++;
      logger.info('cron.sincronizar_pedidos.org', {
        orgId,
        processados: r.processados,
        total: r.total,
      });
    } catch (err) {
      falhas++;
      logger.error('cron.sincronizar_pedidos.erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const resposta = {
    orgs: orgIds.length,
    sincronizadas,
    falhas,
    renovadas,
    expiradas,
    transientes,
  };
  await registrarHeartbeat('sincronizar-pedidos', true, resposta);
  return Response.json(resposta);
}
