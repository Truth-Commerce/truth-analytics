import { describe, expect, it } from 'vitest';

import { preparationWindow } from '@/modules/pipeline/prepare-olist';

describe('Olist shadow preparation window', () => {
  it('uses a UTC half-open 90-day window and preserves the DB watermark', () => {
    expect(preparationWindow('2026-07-30T19:42:10.123Z')).toEqual({
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-07-30T00:00:00.000Z',
      catchUpFrom: '2026-07-30T19:42:10.123Z',
    });
  });

  it('rejects an invalid database timestamp before any remote work can begin', () => {
    expect(() => preparationWindow('not-a-timestamp')).toThrow('prepare_database_clock_invalid');
  });
});
