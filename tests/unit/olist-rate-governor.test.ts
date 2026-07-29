import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { createOlistRateGovernor } from '@/modules/providers/olist/rate-governor.repository';

describe('Olist rate governor', () => {
  it('cancels a grant when the request aborts between DB concession and return to HTTP', async () => {
    const controller = new AbortController();
    let calls = 0;
    const governor = createOlistRateGovernor({
      async execute(_query: ReturnType<typeof sql>) {
        void _query;
        calls += 1;
        if (calls === 1) return [{ id: 'waiter-after-grant' }];
        if (calls === 2) {
          controller.abort();
          return [{
            waiter_id: 'waiter-after-grant',
            start_at: new Date(Date.now() + 1_000),
            active: true,
          }];
        }
        return [];
      },
    });

    await expect(governor.reserve({
      accountFingerprint: 'olist-unit-after-grant',
      priority: 'orders',
      signal: controller.signal,
    })).rejects.toThrow('olist_deadline_exceeded');

    expect(calls).toBe(3);
  });
});
