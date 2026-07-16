import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';
import {
  MAX_USERS_CLIENT_POR_ORG,
  createOrgClientUser,
  listOrgUsers,
} from '@/modules/auth/user.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('createOrgClientUser / listOrgUsers — integração', () => {
  let orgId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-orgusers-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;
    await tdb.insert(users).values({
      org_id: orgId,
      email: `dono-${RUN}@ta-test.com`,
      senha_hash: 'hash_placeholder',
      role: 'client',
      created_at: new Date('2026-01-01T00:00:00Z'),
    });
  });

  afterAll(async () => {
    try {
      await tdb.delete(users).where(eq(users.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      await sql.end();
    }
  });

  it('cria o 2º usuário client na org e listOrgUsers ordena do mais antigo pro mais novo', async () => {
    const { userId } = await createOrgClientUser({
      orgId,
      email: `socio-${RUN}@ta-test.com`,
      senha: 'senha-temporaria-12',
    });
    expect(userId).toBeTruthy();
    const lista = await listOrgUsers(orgId);
    expect(lista.map((u) => u.email)).toEqual([
      `dono-${RUN}@ta-test.com`,
      `socio-${RUN}@ta-test.com`,
    ]);
  });

  it('e-mail já usado (mesmo com caixa diferente) → email_em_uso', async () => {
    await expect(
      createOrgClientUser({ orgId, email: `SOCIO-${RUN}@ta-test.com`, senha: 'x'.repeat(12) }),
    ).rejects.toThrow('email_em_uso');
  });

  it(`respeita MAX_USERS_CLIENT_POR_ORG (${3})`, async () => {
    expect(MAX_USERS_CLIENT_POR_ORG).toBe(3);
    await createOrgClientUser({ orgId, email: `terceiro-${RUN}@ta-test.com`, senha: 'x'.repeat(12) });
    await expect(
      createOrgClientUser({ orgId, email: `quarto-${RUN}@ta-test.com`, senha: 'x'.repeat(12) }),
    ).rejects.toThrow('limite_usuarios');
  });
});
