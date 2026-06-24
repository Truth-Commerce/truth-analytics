import { eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';

export const E2E_PREFIX = 'ta-test-e2e-';

function makeDb() {
  const sql = postgres(process.env.DATABASE_URL_TEST ?? '', { prepare: false });
  const tdb = drizzle(sql);
  return { sql, tdb };
}

export async function cleanupE2E(): Promise<void> {
  const { sql, tdb } = makeDb();
  try {
    const orgs = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(like(organizations.name, `${E2E_PREFIX}%`));
    for (const org of orgs) {
      await tdb.delete(users).where(eq(users.org_id, org.id));
      await tdb.delete(organizations).where(eq(organizations.id, org.id));
    }
  } finally {
    await sql.end();
  }
}

export async function seedE2EAdmin(email: string, senha: string): Promise<void> {
  const { sql, tdb } = makeDb();
  try {
    const senha_hash = await hashPassword(senha);
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${E2E_PREFIX}truth-interno`, status: 'active' })
      .returning({ id: organizations.id });
    await tdb
      .insert(users)
      .values({ org_id: org!.id, email, senha_hash, role: 'admin_truth' });
  } finally {
    await sql.end();
  }
}
