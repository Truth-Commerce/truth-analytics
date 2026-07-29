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
});
