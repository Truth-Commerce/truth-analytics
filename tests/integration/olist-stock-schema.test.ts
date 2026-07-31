import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { hasPostgresErrorCode } from '@/db/postgres-error';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('product_stock Olist expand — integração', () => {
  it('aplica 0025 sem perder estoque legado e mantém as três identidades de rolling deploy', async () => {
    const migrationRoot = resolve(process.cwd(), 'src/db/migrations');
    const migrationDir = await mkdtemp(join(tmpdir(), 'ta-olist-stock-0025-'));
    const schema = `ta_olist_stock_0025_${RUN}`;
    if (!/^ta_olist_stock_0025_\d+$/.test(schema)) {
      throw new Error('invalid isolated migration schema');
    }
    const isolatedSql = postgres(url!, { prepare: false, max: 1 });

    try {
      for (const file of await readdir(migrationRoot)) {
        if (file.endsWith('.sql') && basename(file) < '0025_olist_stock_expand.sql') {
          await copyFile(join(migrationRoot, file), join(migrationDir, file));
        }
      }
      const journal = JSON.parse(
        await readFile(join(migrationRoot, 'meta/_journal.json'), 'utf8'),
      ) as { version: string; dialect: string; entries: Array<{ idx: number }> };
      await mkdir(join(migrationDir, 'meta'));
      await writeFile(
        join(migrationDir, 'meta/_journal.json'),
        `${JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 24) }, null, 2)}\n`,
      );

      await isolatedSql.unsafe(`CREATE SCHEMA "${schema}"`);
      await isolatedSql.unsafe(`SET search_path TO "${schema}"`);
      await migrate(drizzle(isolatedSql), {
        migrationsFolder: migrationDir,
        migrationsSchema: schema,
      });

      const [organization] = await isolatedSql.unsafe<{ id: string }[]>(
        `INSERT INTO "organizations" ("name", "status") VALUES ($1, $2) RETURNING "id"`,
        [`ta-legacy-stock-${RUN}`, 'active'],
      );
      if (!organization?.id) throw new Error('failed to seed legacy organization');

      await isolatedSql.unsafe(
        `INSERT INTO "product_stock"
           ("org_id", "provider", "provider_product_id", "sku", "nome", "saldo")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [organization.id, 'bling', 'legacy-product-1', 'LEGACY-1', 'Produto legado', '17.50'],
      );

      await isolatedSql.unsafe(
        await readFile(join(migrationRoot, '0025_olist_stock_expand.sql'), 'utf8'),
      );

      const rows = await isolatedSql.unsafe<{
        provider: string;
        provider_product_id: string;
        sku: string;
        nome: string;
        saldo: string;
        source_generation: number;
        fencing_version: string;
      }[]>(
        `SELECT "provider", "provider_product_id", "sku", "nome", "saldo",
                "source_generation", "fencing_version"::text AS "fencing_version"
         FROM "product_stock" WHERE "org_id" = $1`,
        [organization.id],
      );
      expect(rows).toEqual([
        {
          provider: 'bling',
          provider_product_id: 'legacy-product-1',
          sku: 'LEGACY-1',
          nome: 'Produto legado',
          saldo: '17.50',
          source_generation: 1,
          fencing_version: '0',
        },
      ]);

      const [legacyWriter] = await isolatedSql.unsafe<{
        source_generation: number;
        fencing_version: string;
      }[]>(
        `INSERT INTO "product_stock" ("org_id", "sku", "nome", "saldo")
         VALUES ($1, $2, $3, $4)
         RETURNING "source_generation", "fencing_version"::text AS "fencing_version"`,
        [organization.id, 'LEGACY-2', 'Writer legado', '3.00'],
      );
      expect(legacyWriter).toEqual({ source_generation: 1, fencing_version: '0' });

      const indexes = await isolatedSql.unsafe<{ indexname: string; indexdef: string }[]>(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN (
            'product_stock_org_sku_uq',
            'product_stock_org_provider_sku_uq',
            'product_stock_org_provider_generation_sku_uq',
            'product_stock_org_provider_generation_updated_idx'
          )
        ORDER BY indexname
      `);
      expect(indexes.map((index) => index.indexname)).toEqual([
        'product_stock_org_provider_generation_sku_uq',
        'product_stock_org_provider_generation_updated_idx',
        'product_stock_org_provider_sku_uq',
        'product_stock_org_sku_uq',
      ]);
      expect(
        indexes.find((index) => index.indexname === 'product_stock_org_provider_generation_sku_uq')
          ?.indexdef,
      ).toContain('(org_id, provider, source_generation, sku)');
      expect(
        indexes.find(
          (index) => index.indexname === 'product_stock_org_provider_generation_updated_idx',
        )?.indexdef,
      ).toContain('(org_id, provider, source_generation, updated_at)');

      const rollingCompatibilityError = await isolatedSql
        .unsafe(
          `INSERT INTO "product_stock"
             ("org_id", "provider", "source_generation", "sku", "nome")
           VALUES ($1, $2, $3, $4, $5)`,
          [organization.id, 'olist', 2, 'LEGACY-1', 'Ainda bloqueado pelas uniques legadas'],
        )
        .then(() => undefined)
        .catch((error: unknown) => error);
      expect(hasPostgresErrorCode(rollingCompatibilityError, '23505')).toBe(true);

      await isolatedSql.unsafe(
        `ALTER TABLE "product_stock" DROP CONSTRAINT "product_stock_org_sku_uq"`,
      );
      await isolatedSql.unsafe(
        `ALTER TABLE "product_stock" DROP CONSTRAINT "product_stock_org_provider_sku_uq"`,
      );
      await isolatedSql.unsafe(
        `INSERT INTO "product_stock"
           ("org_id", "provider", "source_generation", "sku", "nome")
         VALUES ($1, $2, $3, $4, $5)`,
        [organization.id, 'olist', 2, 'GENERATION-UNIQUE', 'Primeiro'],
      );
      const generationDuplicateError = await isolatedSql
        .unsafe(
          `INSERT INTO "product_stock"
             ("org_id", "provider", "source_generation", "sku", "nome")
           VALUES ($1, $2, $3, $4, $5)`,
          [organization.id, 'olist', 2, 'GENERATION-UNIQUE', 'Duplicado'],
        )
        .then(() => undefined)
        .catch((error: unknown) => error);
      expect(hasPostgresErrorCode(generationDuplicateError, '23505')).toBe(true);
    } finally {
      await isolatedSql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
      await isolatedSql.end();
      await rm(migrationDir, { recursive: true, force: true });
    }
  });
});
