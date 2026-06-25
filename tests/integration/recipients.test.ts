import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('recipients — integração', () => {
  let orgAId = '';
  let orgBId = '';
  let orgCId = ''; // org sem usuários
  let userAId = '';

  beforeAll(async () => {
    // Org A com um usuário cliente
    const [orgA] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-recipients-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA.id;

    const [userA] = await tdb
      .insert(users)
      .values({
        org_id: orgAId,
        email: `cliente-${RUN}@ta-test.com`,
        senha_hash: 'hash_placeholder',
        role: 'client',
      })
      .returning({ id: users.id });
    userAId = userA.id;

    // Org B com um usuário diferente (isolamento)
    const [orgB] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-recipients-b-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB.id;

    await tdb.insert(users).values({
      org_id: orgBId,
      email: `cliente-b-${RUN}@ta-test.com`,
      senha_hash: 'hash_placeholder',
      role: 'client',
    });

    // Org C sem nenhum usuário
    const [orgC] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-recipients-c-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgCId = orgC.id;
  });

  afterAll(async () => {
    try {
      // Limpar users antes das orgs (FK constraint)
      await tdb.delete(users).where(eq(users.org_id, orgAId));
      await tdb.delete(users).where(eq(users.org_id, orgBId));
      // Org C não tem users

      await tdb.delete(organizations).where(eq(organizations.id, orgAId));
      await tdb.delete(organizations).where(eq(organizations.id, orgBId));
      await tdb.delete(organizations).where(eq(organizations.id, orgCId));
    } finally {
      await sql.end();
    }
  });

  it('getOrgPrimaryEmail retorna o e-mail do cliente da org A', async () => {
    const { getOrgPrimaryEmail } = await import('@/modules/notifications/recipients');
    const email = await getOrgPrimaryEmail(orgAId);
    expect(email).toBe(`cliente-${RUN}@ta-test.com`);
  });

  it('getOrgPrimaryEmail retorna null para org sem usuários', async () => {
    const { getOrgPrimaryEmail } = await import('@/modules/notifications/recipients');
    const email = await getOrgPrimaryEmail(orgCId);
    expect(email).toBeNull();
  });

  it('isolamento: getOrgPrimaryEmail de org A não retorna usuário de org B', async () => {
    const { getOrgPrimaryEmail } = await import('@/modules/notifications/recipients');
    const emailA = await getOrgPrimaryEmail(orgAId);
    const emailB = await getOrgPrimaryEmail(orgBId);

    expect(emailA).toBe(`cliente-${RUN}@ta-test.com`);
    expect(emailB).toBe(`cliente-b-${RUN}@ta-test.com`);
    expect(emailA).not.toBe(emailB);
  });

  it('getOrgPrimaryEmail retorna null para orgId inexistente', async () => {
    const { getOrgPrimaryEmail } = await import('@/modules/notifications/recipients');
    const email = await getOrgPrimaryEmail('00000000-0000-0000-0000-000000000000');
    expect(email).toBeNull();
  });
});
