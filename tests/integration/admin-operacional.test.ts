import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { auditLog, connections, organizations, reports, users } from '@/db/schema';
import {
  getOrgConnectionHealth,
  listClientOrganizationsPage,
  listOrgReports,
  requeueFailedReport,
} from '@/modules/admin/admin.repository';
import { createQueuedReport } from '@/modules/reports/report.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-adminop-';
const RUN = Date.now();

describe.skipIf(!url)('admin operacional — integração', () => {
  let orgId = '';
  let internalOrgId = '';
  let adminUserId = '';
  let failedReportId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}cliente-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [internal] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}truth-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = internal.id;

    const [admin] = await tdb
      .insert(users)
      .values({
        org_id: internalOrgId,
        email: `adminop-${RUN}@ta-test.example.com`,
        senha_hash: 'x',
        role: 'admin_truth',
      })
      .returning({ id: users.id });
    adminUserId = admin.id;

    await tdb.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'enc',
      refresh_token: 'enc',
      status: 'ok',
    });

    const [failed] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        status: 'failed',
        erro: 'analise_ia_invalida',
      })
      .returning({ id: reports.id });
    failedReportId = failed.id;
  });

  afterAll(async () => {
    await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.delete(users).where(eq(users.org_id, internalOrgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, internalOrgId));
    await sql.end();
  });

  it('listClientOrganizationsPage filtra por nome e traz saúde da conexão', async () => {
    const page = await listClientOrganizationsPage({ q: `${PREFIX}cliente-${RUN}`, page: 1, pageSize: 20 });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: orgId, conexao: 'ok' });
  });

  it('listClientOrganizationsPage exclui org interna', async () => {
    const page = await listClientOrganizationsPage({ q: `${PREFIX}truth-${RUN}`, page: 1, pageSize: 20 });
    expect(page.total).toBe(0);
  });

  it('listOrgReports retorna os reports da org com etapa e erro', async () => {
    const list = await listOrgReports(orgId);
    expect(list.some((r) => r.id === failedReportId && r.erro === 'analise_ia_invalida')).toBe(true);
  });

  it('getOrgConnectionHealth resume a conexão', async () => {
    const health = await getOrgConnectionHealth(orgId);
    expect(health).toMatchObject({ provider: 'bling', saude: 'ok' });
  });

  it('requeueFailedReport re-enfileira só failed e audita', async () => {
    const res = await requeueFailedReport({ reportId: failedReportId, actorUserId: adminUserId });
    expect(res).toEqual({ orgId });
    const [row] = await tdb.select().from(reports).where(eq(reports.id, failedReportId));
    expect(row.status).toBe('queued');
    expect(row.erro).toBeNull();
    // segunda chamada: não está mais failed → null
    expect(await requeueFailedReport({ reportId: failedReportId, actorUserId: adminUserId })).toBeNull();
    // volta para failed para não colidir com o índice parcial em outros testes
    await tdb.update(reports).set({ status: 'failed', erro: 'x' }).where(eq(reports.id, failedReportId));
  });

  it('createQueuedReport insere queued e barra duplicata (relatorio_em_andamento)', async () => {
    const inicio = new Date('2026-06-26');
    const fim = new Date('2026-07-03');
    const reportId = await createQueuedReport(orgId, { inicio, fim });
    expect(reportId).toBeTruthy();
    await expect(createQueuedReport(orgId, { inicio, fim })).rejects.toThrow('relatorio_em_andamento');
    await tdb.delete(reports).where(eq(reports.id, reportId));
  });
});
