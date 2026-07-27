import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';

import { hasPostgresErrorCode } from '@/db/postgres-error';

describe('hasPostgresErrorCode', () => {
  it('detects a legacy PostgreSQL error code at the top level', () => {
    expect(hasPostgresErrorCode({ code: '23505' }, '23505')).toBe(true);
  });

  it('detects a PostgreSQL code wrapped by DrizzleQueryError', () => {
    const postgresError = Object.assign(new Error('duplicate'), { code: '23505' });
    const error = new DrizzleQueryError('insert into reports ...', [], postgresError);

    expect(hasPostgresErrorCode(error, '23505')).toBe(true);
  });

  it('returns false when the PostgreSQL code differs', () => {
    expect(hasPostgresErrorCode({ code: '23503' }, '23505')).toBe(false);
  });

  it.each([null, undefined, '23505', 23505, true, Symbol('error')])(
    'returns false for a non-object value: %s',
    (value) => {
      expect(hasPostgresErrorCode(value, '23505')).toBe(false);
    },
  );

  it('stops safely when the cause chain contains a cycle', () => {
    const error: { cause?: unknown } = {};
    error.cause = error;

    expect(hasPostgresErrorCode(error, '23505')).toBe(false);
  });
});
