import { eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';

const sql = postgres(process.env.DATABASE_URL_TEST ?? '', { prepare: false });
const tdb = drizzle(sql);

export const E2E_PREFIX = 'ta-test-e2e-';

export async function cleanupE2E(): Promise<void> {
  const orgs = await tdb
    .select({ id: organizations.id })
    .from(organizations)
    .where(like(organizations.name, `${E2E_PREFIX}%`));
  for (const org of orgs) {
    await tdb.delete(users).where(eq(users.org_id, org.id));
    await tdb.delete(organizations).where(eq(organizations.id, org.id));
  }
  await sql.end();
}
