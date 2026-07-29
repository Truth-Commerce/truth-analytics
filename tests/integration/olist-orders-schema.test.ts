import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { orders, organizations, reports } from '@/db/schema';
import { hasPostgresErrorCode } from '@/db/postgres-error';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('orders Olist expand — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const db = drizzle(sql);
  let orgId = '';

  beforeAll(async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: `ta-test-olist-orders-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = organization.id;

  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(orders).where(eq(orders.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('aceita pedido Olist sem identificador Bling e mantém unicidade por provider', async () => {
    const value = {
      org_id: orgId,
      provider: 'olist',
      provider_order_id: '991',
      bling_order_id: null,
      canal: 'Mercado Livre',
      data: new Date(),
      valor_total: '100.00',
    };

    await db.insert(orders).values(value);
    const duplicateError = await db
      .insert(orders)
      .values(value)
      .then(() => undefined)
      .catch((error: unknown) => error);
    expect(hasPostgresErrorCode(duplicateError, '23505')).toBe(true);
  });

  it('expõe a unique generation-aware além das uniques legadas', async () => {
    const [index] = await sql.unsafe<{ indexdef: string }[]>(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'orders_org_provider_generation_order_uq'
    `);

    expect(index?.indexdef).toContain('UNIQUE INDEX orders_org_provider_generation_order_uq');
    expect(index?.indexdef).toContain('(org_id, provider, source_generation, provider_order_id)');
  });

  it('preenche relatórios históricos como Bling ao aplicar a migration 0022', async () => {
    const migrationRoot = resolve(process.cwd(), 'src/db/migrations');
    const migrationDir = await mkdtemp(join(tmpdir(), 'ta-olist-0022-'));
    const schema = `ta_olist_0022_${RUN}`;
    const isolatedSql = postgres(url!, { prepare: false, max: 1 });
    const isolatedDb = drizzle(isolatedSql);

    try {
      for (const file of await readdir(migrationRoot)) {
        if (file.endsWith('.sql') && basename(file) < '0022_olist_orders_reports_expand.sql') {
          await copyFile(join(migrationRoot, file), join(migrationDir, file));
        }
      }
      const journal = JSON.parse(
        await readFile(join(migrationRoot, 'meta/_journal.json'), 'utf8'),
      ) as { version: string; dialect: string; entries: Array<{ idx: number }> };
      await mkdir(join(migrationDir, 'meta'));
      await writeFile(
        join(migrationDir, 'meta/_journal.json'),
        `${JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 21) }, null, 2)}\n`,
      );

      await isolatedSql.unsafe(`CREATE SCHEMA "${schema}"`);
      await isolatedSql.unsafe(`SET search_path TO "${schema}"`);
      await migrate(isolatedDb, { migrationsFolder: migrationDir, migrationsSchema: schema });
      const [applied] = await isolatedSql.unsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM "${schema}"."__drizzle_migrations"`,
      );
      expect(applied?.count).toBe(22);

      const [legacyOrg] = await isolatedDb
        .insert(organizations)
        .values({ name: `ta-legacy-report-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      await isolatedSql.unsafe(
        `INSERT INTO "reports" ("org_id", "periodo_inicio", "periodo_fim", "status")
         VALUES ($1, $2, $3, $4)`,
        [
          legacyOrg.id,
          '2024-01-01T00:00:00.000Z',
          '2024-01-31T00:00:00.000Z',
          'done',
        ],
      );

      await isolatedSql.unsafe(
        await readFile(join(migrationRoot, '0022_olist_orders_reports_expand.sql'), 'utf8'),
      );

      const rows = await isolatedDb
        .select({ source: reports.source_provider, generation: reports.source_generation })
        .from(reports)
        .where(eq(reports.org_id, legacyOrg.id));
      expect(rows).toEqual([{ source: 'bling', generation: 1 }]);
    } finally {
      await isolatedSql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
      await isolatedSql.end();
      await rm(migrationDir, { recursive: true, force: true });
    }
  });

  it('mantém writers legados válidos durante rolling deploy', async () => {
    const [row] = await db
      .insert(orders)
      .values({
        org_id: orgId,
        bling_order_id: `legacy-${RUN}`,
        canal: 'Bling',
        data: new Date(),
        valor_total: '10.00',
      })
      .returning();

    expect(row.provider_order_id).toBe(`legacy-${RUN}`);
    expect(row.source_generation).toBe(1);
  });
});
