import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, passwordResetTokens, users } from '@/db/schema';
import { listAllOrganizationsMinimal } from '@/modules/admin/admin.repository';
import { transferCarteiraEmLote } from '@/modules/analista/analista.repository';
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
} from '@/modules/auth/password-reset.repository';
import {
  createUserInOrg,
  getUserWithOrgById,
  listUsersPage,
  normalizeEmail,
} from '@/modules/auth/user.repository';

const url = process.env.DATABASE_URL_TEST;
const PREFIX = 'ta-test-adminusuarios-';
const RUN = Date.now();

describe.skipIf(!url)('gestão de contas admin (H4 T11) — integração', () => {
  let orgAId = '';
  let orgBId = '';
  let internalOrgId = '';
  let adminUserId = '';

  beforeAll(async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-a-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA.id;

    const [orgB] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-b-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB.id;

    const [internal] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}truth-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = internal.id;

    const [admin] = await db
      .insert(users)
      .values({
        org_id: internalOrgId,
        email: `admin-${RUN}@ta-test.example.com`,
        senha_hash: 'x',
        role: 'admin_truth',
      })
      .returning({ id: users.id });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await db.delete(auditLog).where(eq(auditLog.org_id, orgAId));
    await db.delete(auditLog).where(eq(auditLog.org_id, orgBId));
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, adminUserId));
    await db.delete(users).where(eq(users.org_id, orgAId));
    await db.delete(users).where(eq(users.org_id, orgBId));
    await db.delete(users).where(eq(users.org_id, internalOrgId));
    await db.delete(organizations).where(eq(organizations.id, orgAId));
    await db.delete(organizations).where(eq(organizations.id, orgBId));
    await db.delete(organizations).where(eq(organizations.id, internalOrgId));
  });

  describe('createUserInOrg — criação cross-org', () => {
    it('cria usuário role client em qualquer org', async () => {
      const { userId } = await createUserInOrg({
        orgId: orgAId,
        email: `cliente-${RUN}@ta-test.com`,
        role: 'client',
        senha: 'senha-temporaria-1',
      });
      expect(userId).toBeTruthy();
      const [row] = await db.select().from(users).where(eq(users.id, userId));
      expect(row.role).toBe('client');
      expect(row.org_id).toBe(orgAId);
    });

    it('cria usuário role analista em qualquer org (inclusive a interna)', async () => {
      const { userId } = await createUserInOrg({
        orgId: internalOrgId,
        email: `analista-${RUN}@ta-test.com`,
        role: 'analista',
        senha: 'senha-temporaria-2',
      });
      expect(userId).toBeTruthy();
      const [row] = await db.select().from(users).where(eq(users.id, userId));
      expect(row.role).toBe('analista');
    });

    it('rejeita role admin_truth (defesa em profundidade server-side)', async () => {
      await expect(
        createUserInOrg({
          orgId: orgAId,
          email: `hacker-${RUN}@ta-test.com`,
          role: 'admin_truth',
          senha: 'senha-temporaria-3',
        }),
      ).rejects.toThrow('role_invalida');

      const existe = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizeEmail(`hacker-${RUN}@ta-test.com`)));
      expect(existe).toHaveLength(0);
    });

    it('rejeita e-mail já em uso', async () => {
      await expect(
        createUserInOrg({
          orgId: orgBId,
          email: `CLIENTE-${RUN}@ta-test.com`,
          role: 'client',
          senha: 'outra-senha-123',
        }),
      ).rejects.toThrow('email_em_uso');
    });
  });

  describe('listUsersPage — lista cross-org com busca e paginação', () => {
    it('busca por substring do e-mail', async () => {
      const page = await listUsersPage({ q: `cliente-${RUN}`, page: 1 });
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.items.some((u) => u.email === normalizeEmail(`cliente-${RUN}@ta-test.com`))).toBe(
        true,
      );
    });

    it('busca por substring do nome da org', async () => {
      const page = await listUsersPage({ q: `${PREFIX}org-a-${RUN}`, page: 1 });
      expect(page.items.every((u) => u.orgId === orgAId)).toBe(true);
      expect(page.items.length).toBeGreaterThanOrEqual(1);
    });

    it('pagina os resultados (page/pageCount consistentes)', async () => {
      const page = await listUsersPage({ q: `${PREFIX}`, page: 1 });
      expect(page.pageCount).toBeGreaterThanOrEqual(1);
      expect(page.items.length).toBeLessThanOrEqual(20);
    });
  });

  describe('reset de senha via link (reusa esqueci-senha)', () => {
    let resetAlvoUserId = '';

    afterAll(async () => {
      if (resetAlvoUserId) {
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, resetAlvoUserId));
      }
    });

    it('getUserWithOrgById resolve o usuário + org p/ montar o reset', async () => {
      const { userId } = await createUserInOrg({
        orgId: orgAId,
        email: `resetalvo-${RUN}@ta-test.com`,
        role: 'client',
        senha: 'senha-antiga-123',
      });
      resetAlvoUserId = userId;
      const alvo = await getUserWithOrgById(userId);
      expect(alvo).toMatchObject({ id: userId, orgId: orgAId, role: 'client' });

      const token = await createPasswordResetToken(alvo!.email);
      expect(token).toMatch(/^[0-9a-f]{64}$/);

      const link = buildPasswordResetUrl(token!);
      expect(link).toContain('/redefinir-senha/');
      expect(link.endsWith(`/redefinir-senha/${token}`)).toBe(true);

      // o token em claro nunca é persistido — só o hash
      const linhas = await db
        .select({ token_hash: passwordResetTokens.token_hash })
        .from(passwordResetTokens);
      expect(linhas.some((l) => l.token_hash === token)).toBe(false);
    });

    it('getUserWithOrgById retorna null p/ id inexistente', async () => {
      expect(await getUserWithOrgById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('listAllOrganizationsMinimal — para o select de "criar em qualquer org"', () => {
    it('lista todas as orgs (cliente + interna) marcando isInternal', async () => {
      const orgs = await listAllOrganizationsMinimal();
      const a = orgs.find((o) => o.id === orgAId);
      const interna = orgs.find((o) => o.id === internalOrgId);
      expect(a).toMatchObject({ id: orgAId, isInternal: false });
      expect(interna).toMatchObject({ id: internalOrgId, isInternal: true });
    });
  });

  describe('transferCarteiraEmLote — transferência em lote da carteira', () => {
    let analistaOrigemId = '';
    let analistaDestinoId = '';
    let orgC = '';
    let orgD = '';

    beforeAll(async () => {
      const [origem] = await db
        .insert(users)
        .values({
          org_id: internalOrgId,
          email: `origem-${RUN}@ta-test.com`,
          senha_hash: 'x',
          role: 'analista',
        })
        .returning({ id: users.id });
      analistaOrigemId = origem.id;

      const [destino] = await db
        .insert(users)
        .values({
          org_id: internalOrgId,
          email: `destino-${RUN}@ta-test.com`,
          senha_hash: 'x',
          role: 'analista',
        })
        .returning({ id: users.id });
      analistaDestinoId = destino.id;

      const [c] = await db
        .insert(organizations)
        .values({ name: `${PREFIX}org-c-${RUN}`, status: 'active', analista_id: analistaOrigemId })
        .returning({ id: organizations.id });
      orgC = c.id;

      const [d] = await db
        .insert(organizations)
        .values({ name: `${PREFIX}org-d-${RUN}`, status: 'active', analista_id: analistaOrigemId })
        .returning({ id: organizations.id });
      orgD = d.id;
    });

    afterAll(async () => {
      await db.delete(auditLog).where(eq(auditLog.org_id, orgC));
      await db.delete(auditLog).where(eq(auditLog.org_id, orgD));
      await db.delete(organizations).where(eq(organizations.id, orgC));
      await db.delete(organizations).where(eq(organizations.id, orgD));
      await db.delete(users).where(eq(users.id, analistaOrigemId));
      await db.delete(users).where(eq(users.id, analistaDestinoId));
    });

    it('move TODAS as orgs de origem → destino e audita cada org', async () => {
      const res = await transferCarteiraEmLote({
        origemAnalistaUserId: analistaOrigemId,
        destinoAnalistaUserId: analistaDestinoId,
        actorUserId: adminUserId,
      });
      expect(res.orgIds.sort()).toEqual([orgC, orgD].sort());

      const [rowC] = await db.select().from(organizations).where(eq(organizations.id, orgC));
      const [rowD] = await db.select().from(organizations).where(eq(organizations.id, orgD));
      expect(rowC.analista_id).toBe(analistaDestinoId);
      expect(rowD.analista_id).toBe(analistaDestinoId);

      // audit por org (reaproveita o padrão existente de setOrgAnalista: 1 registro por org)
      const auditC = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.org_id, orgC), eq(auditLog.acao, 'org.analista_atribuido')));
      const auditD = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.org_id, orgD), eq(auditLog.acao, 'org.analista_atribuido')));
      expect(auditC.length).toBeGreaterThanOrEqual(1);
      expect(auditD.length).toBeGreaterThanOrEqual(1);
      expect(auditC.at(-1)?.detalhes).toMatchObject({ analistaUserId: analistaDestinoId });
    });

    it('origem sem nenhuma org → no-op (lista vazia, sem erro)', async () => {
      const res = await transferCarteiraEmLote({
        origemAnalistaUserId: analistaOrigemId,
        destinoAnalistaUserId: analistaDestinoId,
        actorUserId: adminUserId,
      });
      expect(res.orgIds).toEqual([]);
    });

    it('rejeita origem/destino inválidos (não são analista)', async () => {
      await expect(
        transferCarteiraEmLote({
          origemAnalistaUserId: adminUserId, // é admin_truth, não analista
          destinoAnalistaUserId: analistaDestinoId,
          actorUserId: adminUserId,
        }),
      ).rejects.toThrow('analista_invalido');

      await expect(
        transferCarteiraEmLote({
          origemAnalistaUserId: analistaOrigemId,
          destinoAnalistaUserId: '00000000-0000-0000-0000-000000000000',
          actorUserId: adminUserId,
        }),
      ).rejects.toThrow('analista_invalido');
    });

    it('rejeita origem igual a destino', async () => {
      await expect(
        transferCarteiraEmLote({
          origemAnalistaUserId: analistaOrigemId,
          destinoAnalistaUserId: analistaOrigemId,
          actorUserId: adminUserId,
        }),
      ).rejects.toThrow('origem_igual_destino');
    });
  });
});
