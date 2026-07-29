import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

  beforeEach(async () => {
    await sqlA`DELETE FROM provider_rate_limit_waiters WHERE provider = 'olist' AND account_fingerprint LIKE ${`olist-${run}%`}`;
    await sqlA`DELETE FROM provider_rate_limit_state WHERE provider = 'olist' AND account_fingerprint LIKE ${`olist-${run}%`}`;
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

  it('mantém o waiter persistente aguardando o lock e respeita FIFO sem lançar queued', async () => {
    const account = fingerprint('fifo');
    const lock = await sqlA.reserve();
    await lock`SELECT pg_advisory_xact_lock(hashtextextended('olist:' || ${account}, 0))`;

    const first = governorA.reserve({ accountFingerprint: account, priority: 'orders' });
    await new Promise(resolve => setTimeout(resolve, 20));
    const second = governorB.reserve({ accountFingerprint: account, priority: 'details' });
    await lock.release();

    const [one, two] = await Promise.all([first, second]);
    expect(one.startAt.getTime()).toBeLessThan(two.startAt.getTime());
  });

  it('limpa concessão cancelada antes de startAt', async () => {
    const account = fingerprint('cancel-granted');
    await governorA.reserve({ accountFingerprint: account, priority: 'orders' });
    const controller = new AbortController();
    const pending = governorB.reserve({ accountFingerprint: account, priority: 'details', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('olist_deadline_exceeded');
    const [waiter] = await sqlA`SELECT granted_at, cancelled_at FROM provider_rate_limit_waiters WHERE provider = 'olist' AND account_fingerprint = ${account} ORDER BY enqueued_at DESC LIMIT 1`;
    expect(waiter.cancelled_at).not.toBeNull();
  });

  it('não bloqueia fingerprints diferentes', async () => {
    const [one, two] = await Promise.all([
      governorA.reserve({ accountFingerprint: fingerprint('a'), priority: 'orders' }),
      governorB.reserve({ accountFingerprint: fingerprint('b'), priority: 'orders' }),
    ]);
    expect(Math.abs(one.startAt.getTime() - two.startAt.getTime())).toBeLessThan(1_000);
  });

  it('concede stock como sexta reserva após cinco high pendentes', async () => {
    const account = fingerprint('fair');
    for (let i = 0; i < 5; i++) await governorA.reserve({ accountFingerprint: account, priority: 'orders' });
    const stock = await governorB.reserve({ accountFingerprint: account, priority: 'stock' });
    const high = await governorA.reserve({ accountFingerprint: account, priority: 'details' });
    expect(stock.startAt.getTime()).toBeLessThan(high.startAt.getTime());
  });

  it('cancela waiter abortado sem conceder slot utilizável', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(governorA.reserve({ accountFingerprint: fingerprint('abort'), priority: 'orders', signal: controller.signal }))
      .rejects.toThrow('olist_deadline_exceeded');
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
