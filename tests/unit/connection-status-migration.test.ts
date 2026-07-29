import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationsDirectory = path.resolve(process.cwd(), 'src/db/migrations');

async function resolveActiveConnectionStatusConstraint(): Promise<string[]> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  let activeConstraint: string[] | null = null;

  for (const file of files) {
    const migration = await readFile(path.join(migrationsDirectory, file), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (
        /ALTER TABLE "connections" DROP CONSTRAINT(?: IF EXISTS)? "connections_status_check"/i
          .test(statement)
      ) {
        activeConstraint = null;
      }

      const added = statement.match(
        /ALTER TABLE "connections" ADD CONSTRAINT "connections_status_check" CHECK \(status IN \(([^)]+)\)\)/i,
      );
      if (!added) continue;
      if (activeConstraint) throw new Error('duplicate_connections_status_check');
      activeConstraint = [...added[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    }
  }

  if (!activeConstraint) throw new Error('connections_status_check_missing');
  return activeConstraint;
}

describe('connections_status_check migration contract', () => {
  it('aceita estados legados e o estado OAuth configurado após todas as migrations', async () => {
    await expect(resolveActiveConnectionStatusConstraint()).resolves.toEqual([
      'ok',
      'expirado',
      'erro',
      'configurado',
    ]);
  });
});
