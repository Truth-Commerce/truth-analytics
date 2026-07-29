import { sql } from 'drizzle-orm';

import { db } from '@/db/client';

export type OlistRequestPriority = 'orders' | 'details' | 'stock';
export type OlistReservation = { waiterId: string; startAt: Date };

/** Small enough to inject a separate database client for each process in tests. */
type SqlExecutor = { execute(query: ReturnType<typeof sql>): PromiseLike<unknown> };
type QueryResult = { rows?: unknown[] } | unknown[];
type Decision = { waiter_id?: string; start_at?: Date | string; wake_at?: Date | string; active?: boolean };

const QUEUE_EXPIRY = "interval '60 seconds'";
const SLOT_INTERVAL = "interval '2223 milliseconds'";

function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  return (result as Exclude<QueryResult, unknown[]>).rows ?? [];
}

function deadlineError(): Error { return new Error('olist_deadline_exceeded'); }

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Waits only until a PostgreSQL-computed queue transition, and always releases listeners. */
function waitForQueueTransition(at: Date, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(deadlineError());
  const delay = Math.max(0, at.getTime() - Date.now());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delay);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(deadlineError()); };
    function done() { signal?.removeEventListener('abort', abort); resolve(); }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function parseCanonicalInteger(raw: string | null, min: number, max: number): number | undefined {
  if (raw === null || !/^(?:0|[1-9]\d*)$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

/** PostgreSQL is the only queue, clock and fairness authority. */
export function createOlistRateGovernor(client: SqlExecutor = db) {
  async function cancel(waiterId: string): Promise<void> {
    // A granted slot can still be cancelled before the HTTP request's startAt.  We
    // retain the consumed slot so cancellation cannot move the distributed clock back.
    await client.execute(sql`
      UPDATE provider_rate_limit_waiters
      SET cancelled_at = clock_timestamp()
      WHERE id = ${waiterId} AND cancelled_at IS NULL
    `);
  }

  async function decide(accountFingerprint: string, waiterId: string): Promise<Decision> {
    return rows(await client.execute(sql`
      WITH locked AS (
        SELECT pg_advisory_xact_lock(hashtextextended('olist:' || ${accountFingerprint}, 0))
      ), purged AS (
        DELETE FROM provider_rate_limit_waiters USING locked
        WHERE provider = 'olist' AND account_fingerprint = ${accountFingerprint}
          AND (expires_at <= clock_timestamp() OR cancelled_at IS NOT NULL)
      ), current_state AS (
        INSERT INTO provider_rate_limit_state
          (provider, account_fingerprint, next_request_at, window_started_at, requests_in_window, consecutive_high_priority)
        SELECT 'olist', ${accountFingerprint}, clock_timestamp(), clock_timestamp(), 0, 0 FROM locked
        ON CONFLICT (provider, account_fingerprint) DO UPDATE SET updated_at = clock_timestamp()
        RETURNING *
      ), normalized AS (
        SELECT s.*,
          CASE WHEN s.window_started_at <= clock_timestamp() - interval '60 seconds' THEN 0 ELSE s.requests_in_window END AS count_in_window,
          CASE WHEN s.window_started_at <= clock_timestamp() - interval '60 seconds' THEN clock_timestamp() ELSE s.window_started_at END AS effective_window_started_at,
          LEAST(27, COALESCE(s.observed_limit, 27)) AS effective_limit
        FROM current_state s
      ), orders_slo_violated AS (
        SELECT EXISTS (
          SELECT 1 FROM connections c
          LEFT JOIN connection_sync_state css ON css.org_id = c.org_id AND css.provider = 'olist' AND css.resource = 'orders'
          WHERE c.provider = 'olist' AND c.provider_account_fingerprint = ${accountFingerprint}
            AND (css.backlog_count > 0 OR (css.backlog_count IS NULL AND css.succeeded_at IS NULL)
              OR css.updated_at < clock_timestamp() - interval '15 minutes')
        ) AS violated
      ), candidate AS (
        SELECT w.id, w.priority, w.expires_at
        FROM provider_rate_limit_waiters w CROSS JOIN normalized n CROSS JOIN orders_slo_violated slo
        WHERE w.provider = 'olist' AND w.account_fingerprint = ${accountFingerprint}
          AND w.expires_at > clock_timestamp() AND w.granted_at IS NULL AND w.cancelled_at IS NULL
          AND NOT (w.priority = 'stock' AND slo.violated)
        ORDER BY
          CASE WHEN n.consecutive_high_priority >= 5
                    AND EXISTS (SELECT 1 FROM provider_rate_limit_waiters sw WHERE sw.provider = w.provider AND sw.account_fingerprint = w.account_fingerprint AND sw.priority = 'stock' AND sw.expires_at > clock_timestamp() AND sw.granted_at IS NULL AND sw.cancelled_at IS NULL)
                 THEN CASE WHEN w.priority = 'stock' THEN 0 ELSE 1 END
                 ELSE CASE WHEN w.priority = 'stock' THEN 1 ELSE 0 END END,
          w.enqueued_at, w.id
        LIMIT 1
      ), granted AS (
        UPDATE provider_rate_limit_waiters w SET granted_at = clock_timestamp()
        FROM candidate c, normalized n
        WHERE w.id = c.id AND w.id = ${waiterId} AND n.count_in_window < n.effective_limit
        RETURNING c.priority
      ), updated AS (
        UPDATE provider_rate_limit_state s
        SET next_request_at = GREATEST(s.next_request_at, clock_timestamp()) + ${sql.raw(SLOT_INTERVAL)},
            window_started_at = n.effective_window_started_at,
            requests_in_window = n.count_in_window + 1,
            consecutive_high_priority = CASE WHEN g.priority = 'stock' THEN 0 ELSE s.consecutive_high_priority + 1 END,
            updated_at = clock_timestamp()
        FROM normalized n, granted g
        WHERE s.provider = 'olist' AND s.account_fingerprint = ${accountFingerprint}
        RETURNING s.next_request_at - ${sql.raw(SLOT_INTERVAL)} AS start_at
      )
      SELECT ${waiterId}::text AS waiter_id, start_at, NULL::timestamptz AS wake_at, true AS active FROM updated
      UNION ALL
      SELECT NULL::text, NULL::timestamptz,
        CASE
          WHEN n.count_in_window >= n.effective_limit THEN n.effective_window_started_at + interval '60 seconds'
          -- Another live waiter owns the head. Recheck at the persisted next slot;
          -- if it is already due this yields immediately rather than inventing a poll delay.
          WHEN c.id IS NOT NULL AND c.id <> ${waiterId} THEN GREATEST(n.next_request_at, clock_timestamp())
          ELSE GREATEST(n.next_request_at, clock_timestamp())
        END,
        EXISTS (
          SELECT 1 FROM provider_rate_limit_waiters own
          WHERE own.id = ${waiterId} AND own.expires_at > clock_timestamp()
            AND own.granted_at IS NULL AND own.cancelled_at IS NULL
        )
      FROM normalized n LEFT JOIN candidate c ON true
      WHERE NOT EXISTS (SELECT 1 FROM updated)
    `))[0] as Decision;
  }

  return {
    async reserve(input: { accountFingerprint: string; priority: OlistRequestPriority; signal?: AbortSignal }): Promise<OlistReservation> {
      if (input.signal?.aborted) throw deadlineError();
      const inserted = rows(await client.execute(sql`
        INSERT INTO provider_rate_limit_waiters (provider, account_fingerprint, priority, expires_at)
        VALUES ('olist', ${input.accountFingerprint}, ${input.priority}, clock_timestamp() + ${sql.raw(QUEUE_EXPIRY)})
        RETURNING id
      `))[0] as { id: string } | undefined;
      if (!inserted) throw new Error('olist_rate_governor_unavailable');

      let cancellation: Promise<void> | undefined;
      const cancelOnce = () => cancellation ??= cancel(inserted.id);
      const abort = () => { void cancelOnce(); };
      input.signal?.addEventListener('abort', abort, { once: true });
      try {
        while (!input.signal?.aborted) {
          const decision = await decide(input.accountFingerprint, inserted.id);
          const startAt = toDate(decision.start_at);
          if (startAt && decision.waiter_id === inserted.id) {
            if (input.signal?.aborted) throw deadlineError();
            return { waiterId: inserted.id, startAt };
          }
          if (!decision.active) throw deadlineError();
          const wakeAt = toDate(decision.wake_at);
          if (!wakeAt) throw new Error('olist_rate_governor_unavailable');
          await waitForQueueTransition(wakeAt, input.signal);
        }
        throw deadlineError();
      } catch (error) {
        if (input.signal?.aborted || error instanceof Error && error.message === 'olist_deadline_exceeded') {
          await cancelOnce();
          throw deadlineError();
        }
        throw error;
      } finally {
        input.signal?.removeEventListener('abort', abort);
      }
    },

    async observe(fingerprint: string, headers: Headers, signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) return;
      const limit = parseCanonicalInteger(headers.get('x-ratelimit-limit'), 1, 27);
      const remaining = parseCanonicalInteger(headers.get('x-ratelimit-remaining'), 0, 27);
      const reset = parseCanonicalInteger(headers.get('x-ratelimit-reset'), 1, 4_102_444_800);
      if (remaining !== undefined && limit !== undefined && remaining > limit) return;
      if (limit === undefined && remaining === undefined && reset === undefined) return;
      if (signal?.aborted) return;
      await client.execute(sql`
        UPDATE provider_rate_limit_state
        SET observed_limit = CASE WHEN ${limit ?? null}::integer IS NULL THEN observed_limit ELSE ${limit ?? null}::integer END,
            observed_remaining = CASE WHEN ${remaining ?? null}::integer IS NULL THEN observed_remaining ELSE ${remaining ?? null}::integer END,
            observed_reset_at = CASE WHEN ${reset ?? null}::bigint IS NULL THEN observed_reset_at ELSE to_timestamp(${reset ?? null}::bigint) END,
            updated_at = clock_timestamp()
        WHERE provider = 'olist' AND account_fingerprint = ${fingerprint}
      `);
    },
  };
}

export async function reserveOlistRequest(input: { accountFingerprint: string; priority: OlistRequestPriority; signal?: AbortSignal }): Promise<OlistReservation> {
  return createOlistRateGovernor().reserve(input);
}
export async function observeOlistRateHeaders(fingerprint: string, headers: Headers, signal?: AbortSignal): Promise<void> {
  return createOlistRateGovernor().observe(fingerprint, headers, signal);
}
