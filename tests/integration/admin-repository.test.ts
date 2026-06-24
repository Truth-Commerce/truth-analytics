import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { auditLog, organizations, users } from '@/db/schema';
import {
  activateOrganization,
  listClientOrganizations,
  suspendOrganization,
} from '@/modules/admin/admin.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-admin-';
const RUN = Date.now();

describe.skipIf(!url)('admin.repository — integração', () => {
  let clientOrgId = '';
  let internalOrgId = '';
  let adminUserId = '';

  beforeAll(async () => {
    const [client] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}cliente-${RUN}`, status: 'pending' })
      .returning({ id: organizations.id });
    clientOrgId = client.id;

    const [internal] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}truth-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = internal.id;

    const [admin] = await tdb
      .insert(users)
      .values({
        org_id: internalOrgId,
        email: `admin-${RUN}@ta-test-admin.example.com`,
        senha_hash: 'x',
        role: 'admin_truth',
      })
      .returning({ id: users.id });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await tdb.delete(auditLog).where(eq(auditLog.org_id, clientOrgId));
    await tdb.delete(users).where(eq(users.org_id, internalOrgId));
    await tdb.delete(organizations).where(eq(organizations.id, clientOrgId));
    await tdb.delete(organizations).where(eq(organizations.id, internalOrgId));
    await sql.end();
  });

  it('listClientOrganizations exclui a org interna (admin_truth)', async () => {
    const list = await listClientOrganizations();
    const ids = list.map((o) => o.id);
    expect(ids).toContain(clientOrgId);
    expect(ids).not.toContain(internalOrgId);
  });

  it('activateOrganization seta active+plano+proximo_relatorio e audita', async () => {
    await activateOrganization({
      orgId: clientOrgId,
      plano: 'weekly',
      actorUserId: adminUserId,
    });
    const [org] = await tdb
      .select()
      .from(organizations)
      .where(eq(organizations.id, clientOrgId))
      .limit(1);
    expect(org.status).toBe('active');
    expect(org.plano).toBe('weekly');
    expect(org.proximo_relatorio_liberado_em).not.toBeNull();

    const audits = await tdb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.org_id, clientOrgId), eq(auditLog.acao, 'org.ativada')));
    expect(audits.length).toBe(1);
  });

  it('suspendOrganization seta suspended', async () => {
    await suspendOrganization({ orgId: clientOrgId, actorUserId: adminUserId });
    const [org] = await tdb
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, clientOrgId))
      .limit(1);
    expect(org.status).toBe('suspended');
  });
});
