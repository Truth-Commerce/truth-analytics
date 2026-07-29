import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createOlistRateGovernor } from '@/modules/providers/olist/rate-governor.repository';

const url = process.env.DATABASE_URL_TEST;
const run = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const fingerprint = (suffix: string) => `olist-${run}-${suffix}`.slice(0, 64);

describe.skipIf(!url)('Olist rate governor — PostgreSQL real', () => {
  const sqlA = postgres(url ?? '', { prepare: false, max: 1 });
  const sqlB = postgres(url ?? '', { prepare: false, max: 1 });
  const governorA = createOlistRateGovernor(drizzle(sqlA));
  const governorB = createOlistRateGovernor(drizzle(sqlB));
  const orgIds: string[] = [];

  async function createOrdersSyncFixture(account: string, input: { backlog: number | null; updatedAgo?: string }) {
    const [organization] = await sqlA`INSERT INTO organizations (name) VALUES (${`governor ${run} ${account}`}) RETURNING id`;
    orgIds.push(organization.id);
    await sqlA`
      INSERT INTO connections (org_id, provider, provider_account_fingerprint, status)
      VALUES (${organization.id}, 'olist', ${account}, 'ok')
    `;
    await sqlA`
      INSERT INTO connection_sync_state (org_id, provider, resource, succeeded_at, backlog_count, updated_at)
      VALUES (
        ${organization.id}, 'olist', 'orders', clock_timestamp(), ${input.backlog},
        clock_timestamp() - ${input.updatedAgo ?? '0 seconds'}::interval
      )
    `;
  }

  beforeEach(async () => {
    await sqlA`DELETE FROM provider_rate_limit_waiters WHERE provider = 'olist' AND account_fingerprint LIKE ${`olist-${run}%`}`;
    await sqlA`DELETE FROM provider_rate_limit_state WHERE provider = 'olist' AND account_fingerprint LIKE ${`olist-${run}%`}`;
    await sqlA`DELETE FROM connection_sync_state WHERE org_id = ANY(${orgIds}::uuid[])`;
    await sqlA`DELETE FROM connections WHERE org_id = ANY(${orgIds}::uuid[])`;
    await sqlA`DELETE FROM organizations WHERE id = ANY(${orgIds}::uuid[])`;
    orgIds.length = 0;
  });
  afterAll(async () => { await sqlA.end(); await sqlB.end(); });

  it('serializa o mesmo fingerprint em dois clientes e concede um slot por waiter', async () => {
    const account = fingerprint('same');
    const [one, two] = await Promise.all([
      governorA.reserve({ accountFingerprint: account, priority: 'orders' }),
      governorB.reserve({ accountFingerprint: account, priority: 'details' }),
    ]);
    expect(one.waiterId).not.toBe(two.waiterId);
    expect(one.startAt.getTime()).not.toBe(two.startAt.getTime());
  });

  it('mantém waiters inseridos atrás de advisory lock transacional e respeita FIFO', async () => {
    const account = fingerprint('fifo');
    let inserts = 0;
    let inserted!: () => void;
    const bothInserted = new Promise<void>(resolve => { inserted = resolve; });
    const barrier = (client: { execute(query: ReturnType<typeof sql>): PromiseLike<unknown> }) => {
      let firstQuery = true;
      return {
        async execute(query: ReturnType<typeof sql>) {
          const result = await client.execute(query);
          if (firstQuery) {
            firstQuery = false;
            inserts += 1;
            if (inserts === 2) inserted();
          }
          return result;
        },
      };
    };
    const lockedGovernorA = createOlistRateGovernor(barrier(drizzle(sqlA)));
    const lockedGovernorB = createOlistRateGovernor(barrier(drizzle(sqlB)));
    const waiting = await sqlA.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended('olist:' || ${account}, 0))`;
      const first = lockedGovernorA.reserve({ accountFingerprint: account, priority: 'orders' });
      const second = lockedGovernorB.reserve({ accountFingerprint: account, priority: 'details' });
      await bothInserted; // real clients crossed the insert barrier while this explicit xact lock is held.
      return [first, second] as const;
    });
    const [one, two] = await Promise.all(waiting);
    expect(one.startAt.getTime()).toBeLessThan(two.startAt.getTime());
  });

  it('rechecks suppressed stock at a future DB wake-up and cancels it after insertion', async () => {
    const account = fingerprint('slo-expired-next-slot');
    await createOrdersSyncFixture(account, { backlog: 1 });
    await sqlA`
      INSERT INTO provider_rate_limit_state (provider, account_fingerprint, next_request_at, window_started_at, requests_in_window, consecutive_high_priority)
      VALUES ('olist', ${account}, clock_timestamp() - interval '1 second', clock_timestamp(), 0, 0)
    `;
    const controller = new AbortController();
    const pending = governorA.reserve({ accountFingerprint: account, priority: 'stock', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('olist_deadline_exceeded');
    const [waiter] = await sqlB`
      SELECT granted_at, cancelled_at FROM provider_rate_limit_waiters
      WHERE provider = 'olist' AND account_fingerprint = ${account}
    `;
    expect(waiter.granted_at).toBeNull();
    expect(waiter.cancelled_at).not.toBeNull();
  });

  it('treats stale orders synchronization as a stock SLO violation', async () => {
    const account = fingerprint('slo-stale');
    await createOrdersSyncFixture(account, { backlog: 0, updatedAgo: '16 minutes' });
    const controller = new AbortController();
    const pending = governorB.reserve({ accountFingerprint: account, priority: 'stock', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('olist_deadline_exceeded');
    const [waiter] = await sqlA`SELECT granted_at, cancelled_at FROM provider_rate_limit_waiters WHERE provider = 'olist' AND account_fingerprint = ${account}`;
    expect(waiter.granted_at).toBeNull();
    expect(waiter.cancelled_at).not.toBeNull();
  });

  it('purges an expired pending waiter before choosing the next live reservation', async () => {
    const account = fingerprint('expiry');
    await sqlA`
      INSERT INTO provider_rate_limit_waiters (provider, account_fingerprint, priority, expires_at)
      VALUES ('olist', ${account}, 'stock', clock_timestamp() - interval '1 second')
    `;
    const reservation = await governorA.reserve({ accountFingerprint: account, priority: 'orders' });
    const [expired] = await sqlB`
      SELECT id FROM provider_rate_limit_waiters
      WHERE provider = 'olist' AND account_fingerprint = ${account} AND expires_at <= clock_timestamp()
    `;
    expect(reservation.waiterId).toBeTruthy();
    expect(expired).toBeUndefined();
  });

  it('gives a pending stock waiter the sixth turn after five high-priority grants when orders SLO is healthy', async () => {
    const account = fingerprint('fair');
    await createOrdersSyncFixture(account, { backlog: 0 });
    await sqlA`
      INSERT INTO provider_rate_limit_state (provider, account_fingerprint, next_request_at, window_started_at, requests_in_window, consecutive_high_priority)
      VALUES ('olist', ${account}, clock_timestamp(), clock_timestamp(), 0, 5)
    `;
    const [stock, high] = await Promise.all([
      governorA.reserve({ accountFingerprint: account, priority: 'stock' }),
      governorB.reserve({ accountFingerprint: account, priority: 'details' }),
    ]);
    expect(stock.startAt.getTime()).toBeLessThan(high.startAt.getTime());
  });

  it('cancels a waiter aborted after insertion without exposing a usable grant', async () => {
    const account = fingerprint('cancel-post-insert');
    await governorA.reserve({ accountFingerprint: account, priority: 'orders' });
    const controller = new AbortController();
    const pending = governorB.reserve({ accountFingerprint: account, priority: 'details', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('olist_deadline_exceeded');
    const [waiter] = await sqlA`SELECT granted_at, cancelled_at FROM provider_rate_limit_waiters WHERE provider = 'olist' AND account_fingerprint = ${account} ORDER BY enqueued_at DESC LIMIT 1`;
    expect(waiter.cancelled_at).not.toBeNull();
    expect(waiter.granted_at).toBeNull();
  });

  it('não bloqueia fingerprints diferentes', async () => {
    const [one, two] = await Promise.all([
      governorA.reserve({ accountFingerprint: fingerprint('a'), priority: 'orders' }),
      governorB.reserve({ accountFingerprint: fingerprint('b'), priority: 'orders' }),
    ]);
    expect(Math.abs(one.startAt.getTime() - two.startAt.getTime())).toBeLessThan(1_000);
  });

  it('observa cada header canônico independentemente e mantém o teto seguro de 27', async () => {
    const account = fingerprint('headers');
    await governorA.reserve({ accountFingerprint: account, priority: 'orders' });
    await governorB.observe(account, new Headers({ 'x-ratelimit-limit': '27' }));
    await governorB.observe(account, new Headers({ 'x-ratelimit-remaining': '26' }));
    await governorB.observe(account, new Headers({ 'x-ratelimit-reset': '2000000000' }));
    await governorB.observe(account, new Headers({ 'x-ratelimit-limit': '27.0' }));
    const [state] = await sqlA`SELECT observed_limit, observed_remaining, observed_reset_at FROM provider_rate_limit_state WHERE provider = 'olist' AND account_fingerprint = ${account}`;
    expect(state.observed_limit).toBe(27);
    expect(state.observed_remaining).toBe(26);
    expect(state.observed_reset_at.getTime()).toBe(2_000_000_000_000);
  });
});
