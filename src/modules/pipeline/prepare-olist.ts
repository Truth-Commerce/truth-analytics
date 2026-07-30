import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { getOlistAccountFingerprint } from '@/modules/connections/provider-connection.repository';
import type { ErpDataSource } from '@/modules/providers/data.types';

export type PreparationStage = 'snapshot' | 'catchup' | 'verify1' | 'verify2' | 'details' | 'ready' | 'blocked' | 'stale';
export type PreparationResult = { stage: PreparationStage; ready: boolean; blocked: boolean; stale: boolean; window: { from: string; to: string; catchUpFrom: string }; reason?: string };
export type PrepareOlistOptions = { deadlineAt?: number; maxOrders?: number; maxDetails?: number };

/** A source-independent UTC window derived from the database clock captured before I/O. */
export function preparationWindow(capturedAt: string): { from: string; to: string; catchUpFrom: string } {
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) throw new Error('prepare_database_clock_invalid');
  const to = new Date(Date.UTC(captured.getUTCFullYear(), captured.getUTCMonth(), captured.getUTCDate()));
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - 90);
  return { from: from.toISOString(), to: to.toISOString(), catchUpFrom: captured.toISOString() };
}

function rows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : ((value as { rows?: T[] }).rows ?? []); }

/**
 * Entry point for the Olist shadow preparation pipeline. It intentionally does
 * not activate a connection or invoke any reporting/cron path.
 */
export async function prepareOlistOrders(source: ErpDataSource, _options: PrepareOlistOptions = {}): Promise<PreparationResult> {
  if (source.provider !== 'olist') throw new Error('prepare_olist_provider_required');
  const clock = rows<{ now: Date | string }>(await db.execute(sql`SELECT clock_timestamp() AS now`))[0];
  if (!clock) throw new Error('prepare_database_clock_unavailable');
  const window = preparationWindow(new Date(clock.now).toISOString());
  const fingerprint = await getOlistAccountFingerprint(source.orgId, source.sourceGeneration);
  if (!fingerprint) return { stage: 'stale', ready: false, blocked: false, stale: true, window, reason: 'source_stale' };
  return { stage: 'blocked', ready: false, blocked: true, stale: false, window, reason: 'preparation_not_started' };
}
