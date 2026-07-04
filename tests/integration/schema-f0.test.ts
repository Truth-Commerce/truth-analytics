import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, passwordResetTokens, reports, users } from '@/db/schema';

describe.skipIf(!process.env.DATABASE_URL_TEST)('schema F0', () => {
  const criadas: { orgId?: string; userId?: string } = {};

  afterAll(async () => {
    if (criadas.userId) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, criadas.userId));
      await db.delete(users).where(eq(users.id, criadas.userId));
    }
    if (criadas.orgId) {
      await db.delete(reports).where(eq(reports.org_id, criadas.orgId));
      await db.delete(organizations).where(eq(organizations.id, criadas.orgId));
    }
  });

  it('lock: segundo report queued/running da mesma org viola reports_org_ativo_uq', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_f0_${randomUUID().slice(0, 8)}`, status: 'active', plano: 'monthly' })
      .returning({ id: organizations.id });
    criadas.orgId = org.id;
    const periodo = { periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-07-01') };

    await db.insert(reports).values({ org_id: org.id, status: 'queued', ...periodo });
    await expect(
      db.insert(reports).values({ org_id: org.id, status: 'running', ...periodo }),
    ).rejects.toThrow();

    // done NÃO conflita (índice é parcial)
    await expect(
      db.insert(reports).values({ org_id: org.id, status: 'done', ...periodo }),
    ).resolves.not.toThrow();
  });

  it('etapa aceita valores válidos e CHECK rejeita inválido', async () => {
    const periodo = { periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-07-01') };
    await expect(
      db.insert(reports).values({
        org_id: criadas.orgId!, status: 'done', etapa: 'analisando_ia', ...periodo,
      }),
    ).resolves.not.toThrow();
    await expect(
      db.insert(reports).values({
        org_id: criadas.orgId!, status: 'done', etapa: 'etapa_invalida', ...periodo,
      }),
    ).rejects.toThrow();
  });

  it('password_reset_tokens: insere e token_hash é único', async () => {
    const [user] = await db
      .insert(users)
      .values({
        org_id: criadas.orgId!,
        email: `t_f0_${randomUUID().slice(0, 8)}@teste.dev`,
        senha_hash: 'x',
        role: 'client',
      })
      .returning({ id: users.id });
    criadas.userId = user.id;
    const hash = 'a'.repeat(64);
    await db.insert(passwordResetTokens).values({
      user_id: user.id, token_hash: hash, expira_em: new Date(Date.now() + 3_600_000),
    });
    await expect(
      db.insert(passwordResetTokens).values({
        user_id: user.id, token_hash: hash, expira_em: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow();
  });
});
