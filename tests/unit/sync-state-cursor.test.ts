import { describe, expect, it } from 'vitest';

import { parseOrdersCursor } from '@/modules/connections/sync-state.repository';

describe('parseOrdersCursor', () => {
  it('preserva um cursor de pedidos canônico', () => {
    expect(parseOrdersCursor({
      pass: 'updated',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-02T00:00:00.000Z',
      updatedAfter: '2026-07-01T00:00:00.000Z',
      offset: 100,
      total: 250,
      sourceGeneration: 3,
    })).toEqual({
      pass: 'updated', from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z',
      updatedAfter: '2026-07-01T00:00:00.000Z', offset: 100, total: 250, sourceGeneration: 3,
    });
  });

  it('reseta explicitamente cursores malformados ou de outra geração', () => {
    expect(parseOrdersCursor({ pass: 'created', offset: -1 }, 3)).toBeNull();
    expect(parseOrdersCursor({
      pass: 'created', from: '0', to: '2026-07-02T00:00:00.000Z',
      updatedAfter: '2026-07-01T00:00:00.000Z', offset: 0, total: null, sourceGeneration: 3,
    }, 3)).toBeNull();
    expect(parseOrdersCursor({
      pass: 'created', from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z',
      updatedAfter: '2026-07-01T00:00:00.000Z', offset: 0, total: null, sourceGeneration: 2,
    }, 3)).toBeNull();
    expect(parseOrdersCursor({
      pass: 'created', from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z',
      updatedAfter: '2026-07-01T00:00:00.000Z', offset: 0, total: null, sourceGeneration: 0,
    })).toBeNull();
  });
});
