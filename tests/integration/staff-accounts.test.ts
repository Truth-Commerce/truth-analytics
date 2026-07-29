import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, users } from '@/db/schema';
import {
  aplicarTrocaDePapel,
  contarAdmins,
  contarCarteira,
  listClientesPage,
  listEquipePage,
} from '@/modules/admin/staff-accounts.repository';

const url = process.env.DATABASE_URL_TEST;
const PREFIX = 'ta-test-staffaccounts-';
const RUN = Date.now();

describe.skipIf(!url)('contas separadas equipe/cliente — integração', () => {
  let internalOrgId = '';
  let clienteOrgId = '';
  let adminId = '';
  let analistaId = '';
  let analistaSoltoId = '';
  let clientId = '';

  beforeAll(async () => {
    const [interna] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}truth-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = interna.id;

    const [cliente] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}empresa-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    clienteOrgId = cliente.id;

    const criados = await db
      .insert(users)
      .values([
        {
          org_id: internalOrgId,
          email: `${PREFIX}admin-${RUN}@example.com`,
          senha_hash: 'x',
          role: 'admin_truth',
        },
        {
          org_id: internalOrgId,
          email: `${PREFIX}analista-${RUN}@example.com`,
          senha_hash: 'x',
          role: 'analista',
        },
        {
          // O caso real: analista lotado na org de um cliente.
          org_id: clienteOrgId,
          email: `${PREFIX}solto-${RUN}@example.com`,
          senha_hash: 'x',
          role: 'analista',
        },
        {
          org_id: clienteOrgId,
          email: `${PREFIX}client-${RUN}@example.com`,
          senha_hash: 'x',
          role: 'client',
        },
      ])
      .returning({ id: users.id, email: users.email });

    adminId = criados[0].id;
    analistaId = criados[1].id;
    analistaSoltoId = criados[2].id;
    clientId = criados[3].id;

    await db
      .update(organizations)
      .set({ analista_id: analistaId })
      .where(eq(organizations.id, clienteOrgId));
  });

  afterAll(async () => {
    const ids = [adminId, analistaId, analistaSoltoId, clientId].filter(Boolean);
    await db
      .update(organizations)
      .set({ analista_id: null })
      .where(inArray(organizations.id, [internalOrgId, clienteOrgId]));
    await db.delete(auditLog).where(inArray(auditLog.org_id, [internalOrgId, clienteOrgId]));
    if (ids.length > 0) await db.delete(users).where(inArray(users.id, ids));
    await db.delete(organizations).where(inArray(organizations.id, [internalOrgId, clienteOrgId]));
  });

  it('listEquipePage traz analistas e admins com a carteira, sem clientes', async () => {
    const { items } = await listEquipePage({ q: `${PREFIX}`, page: 1 });
    const emails = items.map((i) => i.email);

    expect(emails).toContain(`${PREFIX}admin-${RUN}@example.com`);
    expect(emails).toContain(`${PREFIX}analista-${RUN}@example.com`);
    expect(emails).toContain(`${PREFIX}solto-${RUN}@example.com`);
    expect(emails).not.toContain(`${PREFIX}client-${RUN}@example.com`);

    const analista = items.find((i) => i.id === analistaId);
    expect(analista?.carteira).toBe(1);
    expect(analista?.naOrgInterna).toBe(true);

    const solto = items.find((i) => i.id === analistaSoltoId);
    expect(solto?.carteira).toBe(0);
    expect(solto?.naOrgInterna).toBe(false);
  });

  it('listClientesPage traz só usuários client, com status e plano da empresa', async () => {
    const { items } = await listClientesPage({ q: `${PREFIX}`, page: 1 });
    const emails = items.map((i) => i.email);

    expect(emails).toEqual([`${PREFIX}client-${RUN}@example.com`]);
    expect(items[0]).toMatchObject({
      orgId: clienteOrgId,
      orgName: `${PREFIX}empresa-${RUN}`,
      orgStatus: 'active',
      plano: 'weekly',
    });
  });

  it('contarAdmins e contarCarteira leem o estado real', async () => {
    expect(await contarAdmins()).toBeGreaterThanOrEqual(1);
    expect(await contarCarteira(analistaId)).toBe(1);
    expect(await contarCarteira(analistaSoltoId)).toBe(0);
  });

  it('aplicarTrocaDePapel promove o cliente a analista, move para a org interna e audita', async () => {
    await aplicarTrocaDePapel({
      userId: clientId,
      novoPapel: 'analista',
      moverParaOrgId: internalOrgId,
      actorUserId: adminId,
    });

    const [depois] = await db
      .select({ role: users.role, orgId: users.org_id })
      .from(users)
      .where(eq(users.id, clientId));
    expect(depois).toEqual({ role: 'analista', orgId: internalOrgId });

    const trilha = await db
      .select({ acao: auditLog.acao, detalhes: auditLog.detalhes })
      .from(auditLog)
      .where(and(eq(auditLog.org_id, internalOrgId), eq(auditLog.acao, 'user.papel_alterado')));
    expect(trilha).toHaveLength(1);
    expect(trilha[0].detalhes).toMatchObject({
      targetUserId: clientId,
      de: 'client',
      para: 'analista',
      orgAnterior: clienteOrgId,
    });
  });

  it('aplicarTrocaDePapel sem mover mantém a organização do usuário', async () => {
    await aplicarTrocaDePapel({
      userId: clientId,
      novoPapel: 'admin_truth',
      moverParaOrgId: null,
      actorUserId: adminId,
    });

    const [depois] = await db
      .select({ role: users.role, orgId: users.org_id })
      .from(users)
      .where(eq(users.id, clientId));
    expect(depois).toEqual({ role: 'admin_truth', orgId: internalOrgId });
  });
});
