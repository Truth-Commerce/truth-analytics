import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { loginAttempts, organizations, passwordResetTokens, users } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/modules/auth/password';
import { invalidateUserResetTokens } from '@/modules/auth/password-reset.repository';
import { recordAttempt } from '@/modules/auth/rate-limit';
import { getUserAuthById, setUserPasswordHash } from '@/modules/auth/user.repository';
import { renameOrganization } from '@/modules/organizations/organization-settings.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('account repos — integração', () => {
  let orgId = '';
  let userId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-conta-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;
    const [user] = await tdb
      .insert(users)
      .values({
        org_id: orgId,
        email: `conta-${RUN}@ta-test.com`,
        senha_hash: await hashPassword('senha-antiga-123'),
        role: 'client',
      })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    try {
      await tdb.delete(loginAttempts).where(eq(loginAttempts.email, `conta-${RUN}@ta-test.com`));
      await tdb.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, userId));
      await tdb.delete(users).where(eq(users.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      await sql.end();
    }
  });

  it('setUserPasswordHash troca o hash e a senha nova passa no verifyPassword', async () => {
    const novoHash = await hashPassword('senha-nova-456');
    await setUserPasswordHash(userId, novoHash);
    const user = await getUserAuthById(userId);
    expect(user).not.toBeNull();
    expect(await verifyPassword('senha-nova-456', user!.senha_hash)).toBe(true);
    expect(await verifyPassword('senha-antiga-123', user!.senha_hash)).toBe(false);
  });

  it('registra troca_senha sem violar a constraint de escopo', async () => {
    const email = `conta-${RUN}@ta-test.com`;
    await recordAttempt({ escopo: 'troca_senha', email, ip: null, success: true });

    const rows = await tdb
      .select({ escopo: loginAttempts.escopo, success: loginAttempts.success })
      .from(loginAttempts)
      .where(eq(loginAttempts.email, email));

    expect(rows).toContainEqual({ escopo: 'troca_senha', success: true });
  });

  it('invalidateUserResetTokens marca todos os tokens abertos como usados', async () => {
    await tdb.insert(passwordResetTokens).values([
      {
        user_id: userId,
        token_hash: `a`.repeat(63) + '1',
        expira_em: new Date(Date.now() + 60 * 60_000),
      },
      {
        user_id: userId,
        token_hash: `a`.repeat(63) + '2',
        expira_em: new Date(Date.now() + 60 * 60_000),
      },
    ]);
    await invalidateUserResetTokens(userId);
    const abertos = await tdb
      .select({ usado_em: passwordResetTokens.usado_em })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.user_id, userId));
    expect(abertos.length).toBe(2);
    expect(abertos.every((t) => t.usado_em !== null)).toBe(true);
  });

  it('renameOrganization devolve o nome anterior e persiste o novo; org inexistente → null', async () => {
    const res = await renameOrganization(orgId, `ta-test-conta-nova-${RUN}`);
    expect(res).toEqual({ de: `ta-test-conta-${RUN}` });
    const [org] = await tdb
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    expect(org.name).toBe(`ta-test-conta-nova-${RUN}`);
    expect(await renameOrganization('00000000-0000-0000-0000-000000000000', 'x')).toBeNull();
  });
});
