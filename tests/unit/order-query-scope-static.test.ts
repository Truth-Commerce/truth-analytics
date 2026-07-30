import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');
const ORDER_READ = /\.from\(orders\)|\b(?:FROM|JOIN)\s+orders\b/gi;
const EXPECTED_READS: Record<string, number> = {
  'modules/alerts/alert-data.repository.ts': 3,
  'modules/analista/carteira-data.repository.ts': 2,
  'modules/calendario/gerar-calendario.ts': 1,
  'modules/estoque/stock.repository.ts': 2,
  'modules/kits/gerar-kits.ts': 1,
  'modules/organizations/organization-settings.repository.ts': 2,
  'modules/pipeline/steps/compute-metrics.ts': 2,
  'modules/pipeline/steps/enrich-orders.ts': 2,
};

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

function matchCount(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

describe('all production order readers have a frozen provider/generation scope', () => {
  it('keeps the exact inventory and scopes every analytical order read', () => {
    const readers = Object.fromEntries(
      files(ROOT)
        .map((file) => [relative(ROOT, file).replace(/\\/g, '/'), matchCount(readFileSync(file, 'utf8'), ORDER_READ)])
        .filter(([, reads]) => Number(reads) > 0),
    );
    expect(readers).toEqual(EXPECTED_READS);

    for (const [name, reads] of Object.entries(EXPECTED_READS)) {
      if (name === 'modules/pipeline/steps/enrich-orders.ts') continue;
      const content = readFileSync(join(ROOT, name), 'utf8');
      expect(matchCount(content, /\borderScopes?\s*\(/g), name).toBeGreaterThanOrEqual(reads);
    }
  });

  it('keeps enrichment queue reads guarded by all three source predicates', () => {
    const content = readFileSync(join(ROOT, 'modules/pipeline/steps/enrich-orders.ts'), 'utf8');
    expect(matchCount(content, ORDER_READ)).toBe(2);
    expect(matchCount(content, /eq\(orders\.org_id, source\.orgId\)/g)).toBe(2);
    expect(matchCount(content, /eq\(orders\.provider, source\.provider\)/g)).toBe(2);
    expect(matchCount(content, /eq\(orders\.source_generation, source\.sourceGeneration\)/g)).toBe(2);
  });
});
