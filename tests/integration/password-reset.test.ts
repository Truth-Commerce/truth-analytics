import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, passwordResetTokens, users } from '@/db/schema';
import { verifyPassword } from '@/modules/auth/password';
import {
  consumeResetToken,
  createPasswordResetToken,
} from '@/modules/auth/password-reset.repository';

describe.skipIf(!process.env.DATABASE_URL_TEST)('password reset', () => {
  let orgId: string;
  let userId: string;
  const email = `t_pr_${randomUUID().slice(0, 8)}@teste.dev`;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_pr_${randomUUID().slice(0, 8)}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email, senha_hash: 'antigo-hash', role: 'client' })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, userId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('e-mail inexistente → null (anti-enumeração no chamador)', async () => {
    expect(await createPasswordResetToken('nao_existe@teste.dev')).toBeNull();
  });

  it('cria token (64 hex), consome uma única vez e troca a senha', async () => {
    const token = await createPasswordResetToken(email);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // token em claro NÃO está no banco
    const linhas = await db
      .select({ token_hash: passwordResetTokens.token_hash })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.user_id, userId));
    expect(linhas.some((l) => l.token_hash === token)).toBe(false);

    expect(await consumeResetToken(token!, 'senha-nova-12345')).toBe(true);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(await verifyPassword('senha-nova-12345', user.senha_hash)).toBe(true);

    // single-use: segunda tentativa falha
    expect(await consumeResetToken(token!, 'outra-senha-999')).toBe(false);
  });

  it('token expirado é rejeitado', async () => {
    const token = await createPasswordResetToken(email);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(token!).digest('hex');
    await db
      .update(passwordResetTokens)
      .set({ expira_em: new Date(Date.now() - 60_000) })
      .where(eq(passwordResetTokens.token_hash, hash));
    expect(await consumeResetToken(token!, 'senha-nova-12345')).toBe(false);
  });
});
