/**
 * Integration test for createOrgWithUser.
 *
 * Uses DATABASE_URL_TEST (Neon test branch) — never production.
 * We temporarily point POSTGRES_URL at the test branch so that
 * createOrgWithUser (which builds its db client from POSTGRES_URL)
 * writes to the same DB that tdb reads from.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;

// Point the singleton db client at the test branch before any import resolves it.
// vitest resets module registry between files so this is safe.
if (url) {
  process.env.POSTGRES_URL = url;
}

// Dynamic import so the db/client singleton picks up the patched POSTGRES_URL above.
const { createOrgWithUser } = await import('@/modules/auth/user.repository');

const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-iso-';
const RUN_ID = Date.now();

describe.skipIf(!url)('createOrgWithUser — integração', () => {
  const testEmail = `user-${RUN_ID}@ta-test-iso.example.com`;
  const testOrgName = `${PREFIX}org-${RUN_ID}`;

  let createdOrgId = '';
  let createdUserId = '';

  beforeAll(async () => {
    const result = await createOrgWithUser({
      orgName: testOrgName,
      email: testEmail,
      senha: 'senha-segura-123',
    });
    createdOrgId = result.orgId;
    createdUserId = result.userId;
  });

  afterAll(async () => {
    // Clean up: delete users first (FK), then org
    if (createdOrgId) {
      await tdb.delete(users).where(eq(users.org_id, createdOrgId));
      await tdb.delete(organizations).where(eq(organizations.id, createdOrgId));
    }
    await sql.end();
  });

  it('primeiro cadastro retorna { orgId, userId } com ids válidos', () => {
    expect(createdOrgId).toBeTruthy();
    expect(createdUserId).toBeTruthy();
  });

  it('org criada tem status === "pending"', async () => {
    const [org] = await tdb
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, createdOrgId))
      .limit(1);

    expect(org).toBeDefined();
    expect(org.status).toBe('pending');
  });

  it('user criado tem role === "client"', async () => {
    const [user] = await tdb
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, createdUserId))
      .limit(1);

    expect(user).toBeDefined();
    expect(user.role).toBe('client');
  });

  it('segundo cadastro com mesmo email rejeita com Error("email_em_uso")', async () => {
    await expect(
      createOrgWithUser({
        orgName: `${testOrgName}-dup`,
        email: testEmail,
        senha: 'outra-senha-456',
      }),
    ).rejects.toThrow('email_em_uso');
  });
});
