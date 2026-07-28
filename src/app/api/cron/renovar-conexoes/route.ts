import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { pLimit } from '@/lib/p-limit';
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
export const OLIST_REFRESH_CONCURRENCY = 10;

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
  const limit = pLimit(OLIST_REFRESH_CONCURRENCY);
  const results = await Promise.all(candidates.map((candidate) => limit(async () => {
    try {
      const result = await renewOlistConnection(candidate.orgId);
      logger.info('cron.renovar_conexoes.org', { orgId: candidate.orgId, result });
      return result;
    } catch {
      logger.error('cron.renovar_conexoes.unexpected', { orgId: candidate.orgId });
      return 'transient' as const;
    }
  })));

  const renovadas = results.filter(
    (result) => result === 'renewed' || result === 'won-by-peer',
  ).length;
  const expiradas = results.filter((result) => result === 'expired').length;
  const transitorias = results.filter((result) => result === 'transient').length;

  const response = {
    candidatas: candidates.length,
    renovadas,
    expiradas,
    transitorias,
  };
  await registrarHeartbeat('renovar-conexoes', true, response);
  return Response.json(response);
}
