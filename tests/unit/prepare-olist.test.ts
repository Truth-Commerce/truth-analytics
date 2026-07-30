import { describe, expect, it } from 'vitest';

import { preparationWindow } from '@/modules/pipeline/prepare-olist';

describe('preparationWindow', () => {
  it('uses the captured database clock, with today UTC exclusive and a 90-day window', () => {
    expect(preparationWindow('2026-07-30T15:43:22.000Z')).toEqual({
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-07-30T00:00:00.000Z',
      catchUpFrom: '2026-07-30T15:43:22.000Z',
    });
  });
});
