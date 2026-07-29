import { describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)('Olist rate governor — PostgreSQL real', () => {
  it('usa dois clientes independentes para serializar o mesmo slot', async () => {
    const a = postgres(url!, { prepare: false, max: 1 });
    const b = postgres(url!, { prepare: false, max: 1 });
    try {
      const fingerprint = `a${'1'.repeat(63)}`;
      await a`DELETE FROM provider_rate_limit_state WHERE provider = 'olist' AND account_fingerprint = ${fingerprint}`;
      const [one, two] = await Promise.all([
        a`INSERT INTO provider_rate_limit_state (provider, account_fingerprint, next_request_at, window_started_at, requests_in_window, consecutive_high_priority) VALUES ('olist', ${fingerprint}, clock_timestamp(), clock_timestamp(), 0, 0) ON CONFLICT (provider, account_fingerprint) DO UPDATE SET next_request_at = provider_rate_limit_state.next_request_at + interval '2223 milliseconds' RETURNING next_request_at`,
        b`INSERT INTO provider_rate_limit_state (provider, account_fingerprint, next_request_at, window_started_at, requests_in_window, consecutive_high_priority) VALUES ('olist', ${fingerprint}, clock_timestamp(), clock_timestamp(), 0, 0) ON CONFLICT (provider, account_fingerprint) DO UPDATE SET next_request_at = provider_rate_limit_state.next_request_at + interval '2223 milliseconds' RETURNING next_request_at`,
      ]);
      expect(one[0]!.next_request_at.getTime()).not.toBe(two[0]!.next_request_at.getTime());
    } finally { await a.end(); await b.end(); }
  });
});
