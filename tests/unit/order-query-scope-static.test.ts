import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');
const ORDER_READ = /\.from\(orders\)|\b(?:FROM|JOIN)\s+orders\b/i;
// The enrichment queue is intentionally scoped inline because it needs queue-specific predicates.
const INLINE_SCOPED_ALLOWLIST = new Set(['modules/pipeline/steps/enrich-orders.ts']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe('all production order readers have a frozen provider/generation scope', () => {
  it('requires orderScope/orderScopes or the minimal inline-scoped allowlist', () => {
    const readers = files(ROOT).filter((file) => ORDER_READ.test(readFileSync(file, 'utf8')));
    const violations = readers.filter((file) => {
      const content = readFileSync(file, 'utf8');
      const name = relative(ROOT, file).replace(/\\/g, '/');
      return !INLINE_SCOPED_ALLOWLIST.has(name) && !/\borderScopes?\s*\(/.test(content);
    });
    expect({ readers: readers.map((file) => relative(ROOT, file).replace(/\\/g, '/')), violations }).toEqual({
      readers: expect.any(Array),
      violations: [],
    });
  });
});
