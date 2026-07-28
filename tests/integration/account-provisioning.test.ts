import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, users } from '@/db/schema';
import {
  provisionAnalystAccount,
  provisionClientAccount,
} from '@/modules/admin/account-provisioning.repository';
import { verifyPassword } from '@/modules/auth/password';

const url = process.env.DATABASE_URL_TEST;
const PREFIX = 'ta-test-provisioning-';
const RUN = Date.now();

describe.skipIf(!url)('provisionamento administrativo de contas — integração', () => {
  let internalOrgId = '';
  let adminUserId = '';
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    const [internalOrg] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}internal-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = internalOrg.id;

    const [admin] = await db
      .insert(users)
      .values({
        org_id: internalOrgId,
        email: `${PREFIX}admin-${RUN}@example.com`,
        senha_hash: 'hash-admin',
        role: 'admin_truth',
      })
      .returning({ id: users.id });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await db.delete(auditLog).where(eq(auditLog.org_id, orgId));
      await db.delete(users).where(eq(users.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    if (internalOrgId) {
      await db.delete(auditLog).where(eq(auditLog.org_id, internalOrgId));
      await db.delete(users).where(eq(users.org_id, internalOrgId));
      await db.delete(organizations).where(eq(organizations.id, internalOrgId));
    }
  });

  it('cria organização pending, primeiro cliente e audit na mesma operação', async () => {
    const email = `${PREFIX}client-${RUN}@Example.com`;
    const senha = 'temporaria-client-123';
    const result = await provisionClientAccount({
      orgName: `  ${PREFIX}Loja ${RUN}  `,
      email,
      senha,
      actorUserId: adminUserId,
    });
    createdOrgIds.push(result.orgId);

    const [org] = await db.select().from(organizations).where(eq(organizations.id, result.orgId));
    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.org_id, result.orgId), eq(auditLog.acao, 'org.criada_admin')),
      );

    expect(org).toMatchObject({
      id: result.orgId,
      name: `${PREFIX}Loja ${RUN}`,
      status: 'pending',
      plano: null,
    });
    expect(user).toMatchObject({
      id: result.userId,
      org_id: result.orgId,
      email: email.toLowerCase(),
      role: 'client',
      aceitou_termos_em: null,
    });
    expect(await verifyPassword(senha, user.senha_hash)).toBe(true);
    expect(audit).toMatchObject({
      org_id: result.orgId,
      user_id: adminUserId,
      acao: 'org.criada_admin',
      detalhes: {
        novoUserId: result.userId,
        email: email.toLowerCase(),
      },
    });
    expect(JSON.stringify(audit.detalhes)).not.toContain(senha);
  });

  it('e-mail duplicado reverte toda a transação e não deixa organização órfã', async () => {
    const duplicateEmail = `${PREFIX}duplicate-${RUN}@example.com`;
    await db.insert(users).values({
      org_id: internalOrgId,
      email: duplicateEmail,
      senha_hash: 'hash-existente',
      role: 'analista',
    });

    const orphanName = `${PREFIX}nao-pode-existir-${RUN}`;
    await expect(
      provisionClientAccount({
        orgName: orphanName,
        email: duplicateEmail.toUpperCase(),
        senha: 'temporaria-duplicada-123',
        actorUserId: adminUserId,
      }),
    ).rejects.toThrow('email_em_uso');

    const orphanRows = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.name, orphanName));
    expect(orphanRows).toHaveLength(0);
  });

  it('cria analista diretamente na organização interna e audita sem senha', async () => {
    const email = `${PREFIX}analista-${RUN}@Example.com`;
    const senha = 'temporaria-analista-123';
    const { userId } = await provisionAnalystAccount({
      internalOrgId,
      email,
      senha,
      actorUserId: adminUserId,
    });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.org_id, internalOrgId), eq(auditLog.acao, 'user.criado_admin')),
      )
      .orderBy(auditLog.created_at);

    expect(user).toMatchObject({
      id: userId,
      org_id: internalOrgId,
      email: email.toLowerCase(),
      role: 'analista',
      aceitou_termos_em: null,
    });
    expect(await verifyPassword(senha, user.senha_hash)).toBe(true);
    expect(audit).toMatchObject({
      org_id: internalOrgId,
      user_id: adminUserId,
      acao: 'user.criado_admin',
      detalhes: { novoUserId: userId, email: email.toLowerCase(), role: 'analista' },
    });
    expect(JSON.stringify(audit.detalhes)).not.toContain(senha);
  });
});
