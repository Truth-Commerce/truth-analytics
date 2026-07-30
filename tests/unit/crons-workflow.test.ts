import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('crons workflow', () => {
  it('schedules preparar-olist every two hours and maps that schedule to its route', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/crons.yml'), 'utf8');

    expect(workflow).toContain('cron: "19 */2 * * *"');
    expect(workflow).toMatch(/"19 \*\/2 \* \* \*"\) rota=preparar-olist ;;?/);
  });
});
