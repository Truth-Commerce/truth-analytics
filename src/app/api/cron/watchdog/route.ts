import { and, inArray, lt } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const TIMEOUT_MINUTOS = 20;

/**
 * Watchdog (Vercel Cron, a cada 10 min): marca como failed todo report
 * queued/running cujo updated_at (heartbeat de etapa do orquestrador) está
 * parado há mais de 20 min — reaper dos órfãos de crash/timeout da função.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const limite = new Date(Date.now() - TIMEOUT_MINUTOS * 60_000);
  const presos = await db
    .update(reports)
    .set({ status: 'failed', erro: 'timeout_watchdog' })
    .where(and(inArray(reports.status, ['queued', 'running']), lt(reports.updated_at, limite)))
    .returning({ id: reports.id, org_id: reports.org_id });

  if (presos.length > 0) {
    logger.warn('watchdog marcou relatórios presos como failed', {
      quantidade: presos.length,
      reportIds: presos.map((p) => p.id),
    });
  }
  return NextResponse.json({ marcados: presos.length });
}
