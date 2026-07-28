import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { registrarHeartbeat } from '@/modules/admin/heartbeat.repository';
import {
  OLIST_REFRESH_BATCH,
  OLIST_REFRESH_MARGIN_MS,
  renewOlistConnection,
} from '@/modules/connections/olist-token-renewal';
import { listProviderConnectionsExpiring } from '@/modules/connections/provider-connection.repository';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (
    !serverEnv.CRON_SECRET ||
    !secretsMatch(request.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)
  ) {
    return new Response('unauthorized', { status: 401 });
  }

  const candidates = await listProviderConnectionsExpiring({
    provider: 'olist',
    marginMs: OLIST_REFRESH_MARGIN_MS,
    limit: OLIST_REFRESH_BATCH,
  });
  let renovadas = 0;
  let expiradas = 0;
  let transitorias = 0;

  for (const candidate of candidates) {
    try {
      const result = await renewOlistConnection(candidate.orgId);
      if (result === 'renewed' || result === 'won-by-peer') renovadas += 1;
      else if (result === 'expired') expiradas += 1;
      else transitorias += 1;
      logger.info('cron.renovar_conexoes.org', { orgId: candidate.orgId, result });
    } catch {
      transitorias += 1;
      logger.error('cron.renovar_conexoes.unexpected', { orgId: candidate.orgId });
    }
  }

  const response = {
    candidatas: candidates.length,
    renovadas,
    expiradas,
    transitorias,
  };
  await registrarHeartbeat('renovar-conexoes', true, response);
  return Response.json(response);
}
