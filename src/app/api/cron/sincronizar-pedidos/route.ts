import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { listOrgsComBlingOk } from '@/modules/connections/connection.repository';
import {
  LOTE_MAXIMO_SYNC,
  sincronizarPedidosDaOrg,
} from '@/modules/pipeline/sync-pedidos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diário (7h UTC — Vercel manda `Authorization: Bearer CRON_SECRET`):
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

  return Response.json({ orgs: orgIds.length, sincronizadas, falhas });
}
