import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations } from '@/db/schema';

// Usa banco de TESTE dedicado (branch Neon), nunca o de produção.
const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-iso-';

describe.skipIf(!url)('isolamento multi-tenant', () => {
  let orgA = '';
  let orgB = '';

  beforeAll(async () => {
    const [a] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}A`, status: 'active' })
      .returning({ id: organizations.id });
    const [b] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}B`, status: 'active' })
      .returning({ id: organizations.id });
    orgA = a.id;
    orgB = b.id;
  });

  afterAll(async () => {
    await tdb.delete(organizations).where(eq(organizations.name, `${PREFIX}A`));
    await tdb.delete(organizations).where(eq(organizations.name, `${PREFIX}B`));
    await sql.end();
  });

  it('uma query filtrada por org_id nunca devolve linhas de outra org', async () => {
    const rows = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgA));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(orgA);
    expect(rows.some((r) => r.id === orgB)).toBe(false);
  });
});
