import { serverEnv } from '@/lib/env';
import { secretsMatch } from '@/lib/secret-compare';
import { registrarHeartbeat } from '@/modules/admin/heartbeat.repository';
import { listOlistConnectionsPendingPreparation } from '@/modules/connections/provider-connection.repository';
import { prepareOlistOrders } from '@/modules/pipeline/prepare-olist';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET || !secretsMatch(request.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) return new Response('unauthorized', { status: 401 });
  if (!serverEnv.OLIST_DATA_SYNC_ENABLED) return Response.json({ disabled: true, orgs: 0 });
  if (!serverEnv.OLIST_DATA_SYNC_ORG_IDS.length) return Response.json({ orgs: 0, prepared: 0, failed: 0 });
  const deadlineAt = Date.now() + 235_000;
  const sources = await listOlistConnectionsPendingPreparation({ orgIds: serverEnv.OLIST_DATA_SYNC_ORG_IDS, limit: 3 });
  let prepared = 0; let failed = 0;
  for (const source of sources) { try { await prepareOlistOrders(source, { deadlineAt }); prepared++; } catch { failed++; } }
  const result = { orgs: sources.length, prepared, failed };
  await registrarHeartbeat('preparar-olist', failed === 0, result);
  return Response.json(result);
}
