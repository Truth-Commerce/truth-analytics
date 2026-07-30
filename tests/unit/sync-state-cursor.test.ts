import { describe, expect, it } from 'vitest';

import {
  createSyncStateRepository,
  parsePreparationCursor,
  parseOrdersCursor,
} from '@/modules/connections/sync-state.repository';

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

  it('recusa geração inválida antes de consultar o banco', async () => {
    const repository = createSyncStateRepository({
      execute: async () => { throw new Error('database_must_not_be_called'); },
    });
    await expect(repository.acquireSyncLease({
      source: {
        orgId: crypto.randomUUID(),
        provider: 'olist',
        sourceGeneration: 0,
        accountFingerprint: 'a'.repeat(64),
      },
      resource: 'orders_list',
      ttlMs: 1_000,
    })).rejects.toThrow('sync_source_generation_invalid');
  });
});

describe('parsePreparationCursor', () => {
  it('fails closed for stale or malformed preparation state', () => {
    const valid = {
      version: 1,
      stage: 'ready',
      sourceGeneration: 3,
      accountFingerprint: 'a'.repeat(64),
      window: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z' },
      catchUpFrom: '2026-07-02T00:00:00.000Z',
      snapshot: { done: true },
      catchup: { done: true, completedAt: '2026-07-02T00:00:00.000Z' },
      verify1: { done: true, expectedCount: 2, checksum: 'a'.repeat(32), dailyChecksum: 'b'.repeat(32), channelChecksum: 'c'.repeat(32) },
      verify2: { done: true, expectedCount: 2, checksum: 'a'.repeat(32), dailyChecksum: 'b'.repeat(32), channelChecksum: 'c'.repeat(32) },
    };
    expect(parsePreparationCursor(valid, 3, 'a'.repeat(64))).toEqual(valid);
    expect(parsePreparationCursor(valid, 4, 'a'.repeat(64))).toBeNull();
    expect(parsePreparationCursor(valid, 3, 'b'.repeat(64))).toBeNull();
    expect(parsePreparationCursor({ version: 2 }, 3, 'a'.repeat(64))).toBeNull();
    expect(parsePreparationCursor({ ...valid, verify2: { ...valid.verify2, expectedCount: -1 } }, 3, 'a'.repeat(64))).toBeNull();
    expect(parsePreparationCursor({ ...valid, verify2: { ...valid.verify2, dailyChecksum: 'd'.repeat(32) } }, 3, 'a'.repeat(64))).toBeNull();
  });

  it('preserva progresso retomável por fase e recusa offset inválido', () => {
    const cursor = {
      version: 1, stage: 'snapshot', sourceGeneration: 3, accountFingerprint: 'a'.repeat(64),
      window: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z' },
      catchUpFrom: '2026-07-02T12:00:00.000Z', snapshot: { done: false }, catchup: { done: false, completedAt: null },
      verify1: null, verify2: null, progress: { phaseKey: 'snapshot', cycleId: 'cycle-a', offset: 100, total: 250 },
    };
    expect(parsePreparationCursor(cursor, 3, 'a'.repeat(64))).toEqual(cursor);
    expect(parsePreparationCursor({ ...cursor, progress: { ...cursor.progress, offset: -1 } }, 3, 'a'.repeat(64))).toBeNull();
    expect(parsePreparationCursor({ ...cursor, progress: { ...cursor.progress, phaseKey: 'unknown' } }, 3, 'a'.repeat(64))).toBeNull();
  });
});
