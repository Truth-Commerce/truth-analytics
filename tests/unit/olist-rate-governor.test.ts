import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { createOlistRateGovernor } from '@/modules/providers/olist/rate-governor.repository';

describe('Olist rate governor', () => {
  it('rolls back rate-limit headers when the request aborts while their update is in flight', async () => {
    const controller = new AbortController();
    let persistedLimit: number | undefined;
    let pendingLimit: number | undefined;
    const governor = createOlistRateGovernor({
      async transaction<T>(callback: (transaction: { execute(query: ReturnType<typeof sql>): PromiseLike<unknown> }) => Promise<T>): Promise<T> {
        try {
          const result = await callback({
            async execute(_query: ReturnType<typeof sql>) {
              void _query;
              pendingLimit = 27;
              controller.abort();
              return [];
            },
          });
          persistedLimit = pendingLimit;
          return result;
        } finally {
          pendingLimit = undefined;
        }
      },
      async execute(_query: ReturnType<typeof sql>) {
        void _query;
        persistedLimit = 27;
        controller.abort();
        return [];
      },
    });

    await governor.observe(
      'olist-unit-abort-observe',
      new Headers({ 'x-ratelimit-limit': '27' }),
      controller.signal,
    );

    expect(persistedLimit).toBeUndefined();
  });
});
