import { createCipheriv, randomBytes } from 'node:crypto';

import { eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, organizations, trackedProducts, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';

/** Mirrors encryptSecret from @/modules/crypto/crypto — avoids importing serverEnv in the test helper. */
function encryptForTest(plaintext: string): string {
  const encKey = process.env.ENCRYPTION_KEY ?? '';
  const key = Buffer.from(encKey, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

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
      await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, org.id));
      await tdb.delete(connections).where(eq(connections.org_id, org.id));
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

export async function seedE2EActiveClient(email: string, senha: string): Promise<string> {
  const { sql, tdb } = makeDb();
  try {
    const senha_hash = await hashPassword(senha);
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${E2E_PREFIX}cliente-ativo`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    await tdb
      .insert(users)
      .values({ org_id: org!.id, email, senha_hash, role: 'client' });
    return org!.id;
  } finally {
    await sql.end();
  }
}

/** Inserts a fake-but-valid Bling connection (status 'ok') directly into the test DB. */
export async function seedBlingConnection(orgId: string): Promise<void> {
  const { sql, tdb } = makeDb();
  try {
    const fakeAccessToken = encryptForTest('fake-access-token');
    const fakeRefreshToken = encryptForTest('fake-refresh-token');
    const expira_em = new Date(Date.now() + 3600 * 1000); // 1h from now
    await tdb
      .insert(connections)
      .values({
        org_id: orgId,
        provider: 'bling',
        access_token: fakeAccessToken,
        refresh_token: fakeRefreshToken,
        expira_em,
        status: 'ok',
      })
      .onConflictDoUpdate({
        target: [connections.org_id, connections.provider],
        set: {
          access_token: fakeAccessToken,
          refresh_token: fakeRefreshToken,
          expira_em,
          status: 'ok',
        },
      });
  } finally {
    await sql.end();
  }
}
