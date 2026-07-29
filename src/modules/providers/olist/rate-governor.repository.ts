import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export type OlistRequestPriority = 'orders' | 'details' | 'stock';
export type OlistReservation = { startAt: Date };

type SqlExecutor = { execute(query: ReturnType<typeof sql>): PromiseLike<unknown> };

/** Factory keeps scheduling authority in PostgreSQL and makes integration clients injectable. */
export function createOlistRateGovernor(client: SqlExecutor = db) {
  return {
    async reserve(input: { accountFingerprint: string; priority: OlistRequestPriority; signal?: AbortSignal }): Promise<OlistReservation> {
      if (input.signal?.aborted) throw new Error('olist_deadline_exceeded');
      const slot = await client.execute(sql`
        WITH state AS (
          INSERT INTO provider_rate_limit_state (provider, account_fingerprint, next_request_at, window_started_at, requests_in_window, consecutive_high_priority)
          VALUES ('olist', ${input.accountFingerprint}, clock_timestamp(), clock_timestamp(), 0, 0)
          ON CONFLICT (provider, account_fingerprint) DO UPDATE SET updated_at = clock_timestamp()
          RETURNING *
        ), expired AS (
          DELETE FROM provider_rate_limit_waiters WHERE provider='olist' AND account_fingerprint=${input.accountFingerprint} AND expires_at <= clock_timestamp()
        ), mine AS (
          INSERT INTO provider_rate_limit_waiters (provider, account_fingerprint, priority, expires_at)
          VALUES ('olist', ${input.accountFingerprint}, ${input.priority}, clock_timestamp() + interval '60 seconds') RETURNING id
        ), candidate AS (
          SELECT w.id, w.priority FROM provider_rate_limit_waiters w, state s
          WHERE w.provider='olist' AND w.account_fingerprint=${input.accountFingerprint} AND w.expires_at > clock_timestamp() AND w.granted_at IS NULL
          ORDER BY CASE WHEN s.consecutive_high_priority >= 5 AND EXISTS (SELECT 1 FROM provider_rate_limit_waiters sw WHERE sw.provider=w.provider AND sw.account_fingerprint=w.account_fingerprint AND sw.priority='stock' AND sw.granted_at IS NULL AND sw.expires_at > clock_timestamp()) THEN CASE WHEN w.priority='stock' THEN 0 ELSE 1 END ELSE CASE WHEN w.priority='stock' THEN 1 ELSE 0 END END, w.enqueued_at, w.id
          LIMIT 1
        ), granted AS (
          UPDATE provider_rate_limit_waiters w SET granted_at=clock_timestamp() FROM candidate c WHERE w.id=c.id RETURNING c.priority
        )
        UPDATE provider_rate_limit_state s SET
          next_request_at = GREATEST(COALESCE(s.next_request_at, clock_timestamp()), clock_timestamp()) + interval '2223 milliseconds',
          requests_in_window = s.requests_in_window + 1,
          consecutive_high_priority = CASE WHEN (SELECT priority FROM granted)='stock' THEN 0 ELSE s.consecutive_high_priority+1 END,
          updated_at=clock_timestamp()
        WHERE s.provider='olist' AND s.account_fingerprint=${input.accountFingerprint}
        RETURNING s.next_request_at - interval '2223 milliseconds' AS start_at
      `) as { rows?: unknown[] } | unknown[];
      const row = (Array.isArray(slot) ? slot : slot.rows ?? [])[0] as { start_at: Date } | undefined;
      if (!row || input.signal?.aborted) throw new Error('olist_deadline_exceeded');
      return { startAt: new Date(row.start_at) };
    },
    async observe(fingerprint: string, headers: Headers, signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) return;
      const limit = Number(headers.get('x-ratelimit-limit'));
      const remaining = Number(headers.get('x-ratelimit-remaining'));
      const reset = headers.get('x-ratelimit-reset');
      if (!Number.isFinite(limit) && !Number.isFinite(remaining) && !reset) return;
      await client.execute(sql`
        UPDATE provider_rate_limit_state SET
          observed_limit = CASE WHEN ${Number.isFinite(limit)} THEN ${limit} ELSE observed_limit END,
          observed_remaining = CASE WHEN ${Number.isFinite(remaining)} THEN ${remaining} ELSE observed_remaining END,
          observed_reset_at = CASE WHEN ${reset} <> '' THEN to_timestamp(${reset}::double precision) ELSE observed_reset_at END,
          updated_at = clock_timestamp()
        WHERE provider = 'olist' AND account_fingerprint = ${fingerprint}
      `);
    },
  };
}

export async function reserveOlistRequest(input: { accountFingerprint: string; priority: OlistRequestPriority }): Promise<OlistReservation> {
  return createOlistRateGovernor().reserve(input);
}

export async function observeOlistRateHeaders(fingerprint: string, headers: Headers): Promise<void> {
  return createOlistRateGovernor().observe(fingerprint, headers);
}
