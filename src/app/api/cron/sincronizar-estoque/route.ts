import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { registrarHeartbeat } from '@/modules/admin/heartbeat.repository';
import { listOrgsComBlingOk } from '@/modules/connections/connection.repository';
import { sincronizarEstoqueDaOrg } from '@/modules/estoque/sync-estoque';
import { LOTE_MAXIMO_SYNC } from '@/modules/pipeline/sync-pedidos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diário (7h30 UTC, GitHub Actions manda `Authorization: Bearer CRON_SECRET`):
 * sincroniza o snapshot de estoque (GET /produtos do Bling) de cada org com
 * conexão ok. Roda 30min após o sincronizar-pedidos para a velocidade de
 * venda estar fresca. Falha em UMA org (try/catch) não aborta o lote.
 */
export async function GET(req: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET) {
    return Response.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  const orgIds = (await listOrgsComBlingOk()).slice(0, LOTE_MAXIMO_SYNC);
  let sincronizadas = 0;
  let falhas = 0;

  for (const orgId of orgIds) {
    try {
      const r = await sincronizarEstoqueDaOrg(orgId);
      sincronizadas++;
      logger.info('cron.sincronizar_estoque.org', { orgId, produtos: r.produtos });
    } catch (err) {
      falhas++;
      logger.error('cron.sincronizar_estoque.erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const resposta = { orgs: orgIds.length, sincronizadas, falhas };
  await registrarHeartbeat('sincronizar-estoque', true, resposta);
  return Response.json(resposta);
}
