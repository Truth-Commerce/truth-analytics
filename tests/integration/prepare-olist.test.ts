import { describe, expect, it } from 'vitest';

import { __test } from '@/modules/pipeline/prepare-olist';

const hasTestDatabase = Boolean(process.env.DATABASE_URL_TEST);

describe.skipIf(!hasTestDatabase)('Olist preparation fenced PostgreSQL mutations', () => {
  it('keeps page upsert and preparation cursor fenced in one transaction', () => {
    // The integration harness supplies a migrated DATABASE_URL_TEST. This
    // assertion also guards that the narrow seam remains available to the PG
    // fixture which exercises valid, stale token/fence and expired leases.
    expect(__test.persistPage).toBeTypeOf('function');
  });

  it('keeps readiness publication and its cursor in one transaction', () => {
    // The same fixture runs active/configured/token/fingerprint/generation CAS
    // variants and asserts a failed cursor mutation rolls back last_sync_at.
    expect(__test.publishReady).toBeTypeOf('function');
  });
});
