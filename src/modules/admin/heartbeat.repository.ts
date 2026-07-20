import { db } from '@/db/client';
import { cronHeartbeats, type CronHeartbeatRecord } from '@/db/schema';
import { logger } from '@/lib/logger';

/**
 * Heartbeat de crons (Task 9/H4) — 1 UPSERT por pk `rota` a cada execução.
 * Chamado no caminho de sucesso das 6 rotas de cron: NUNCA lança (try/catch
 * interno + logger.warn) para que uma falha de observabilidade jamais altere
 * o response do cron.
 */
export async function registrarHeartbeat(
  rota: string,
  ok: boolean,
  detalhes: Record<string, unknown>,
): Promise<void> {
  try {
    const executado_em = new Date();
    await db
      .insert(cronHeartbeats)
      .values({ rota, executado_em, ok, detalhes })
      .onConflictDoUpdate({
        target: cronHeartbeats.rota,
        set: { executado_em, ok, detalhes },
      });
  } catch (err) {
    logger.warn('heartbeat.registrar_falhou', {
      rota,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listHeartbeats(): Promise<CronHeartbeatRecord[]> {
  return db.select().from(cronHeartbeats);
}
