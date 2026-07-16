/**
 * Integration test for createOrgWithUser.
 *
 * Uses DATABASE_URL_TEST (Neon test branch) — never production.
 * tests/setup.ts (setupFiles) already redirects POSTGRES_URL → DATABASE_URL_TEST
 * before any module loads, so the app DB client writes to the test branch.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';
import { createOrgWithUser } from '@/modules/auth/user.repository';

const url = process.env.DATABASE_URL_TEST;

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

  it('grava o aceite dos termos (aceitou_termos_em preenchido)', async () => {
    const [user] = await tdb
      .select({ aceitou_termos_em: users.aceitou_termos_em })
      .from(users)
      .where(eq(users.id, createdUserId))
      .limit(1);
    expect(user.aceitou_termos_em).toBeInstanceOf(Date);
  });
});
