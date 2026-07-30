import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();
const periodo = { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T23:59:59Z') };

describe.skipIf(!url)('claimQueuedReport — integração', () => {
  let orgId = '';
  let noSourceOrgId = '';
  let unknownSourceOrgId = '';
  let reportId = '';

  beforeAll(async () => {
    [orgId, noSourceOrgId, unknownSourceOrgId] = await Promise.all(
      ['claim', 'sem-source', 'source-desconhecida'].map(async (name) => {
        const [org] = await tdb.insert(organizations).values({ name: `ta-${name}-${RUN}`, status: 'active' }).returning({ id: organizations.id });
        return org.id;
      }),
    );
    await tdb.insert(connections).values({ org_id: orgId, provider: 'olist', data_generation: 7, access_token: 'token', status: 'ok' });
    await tdb.insert(connections).values({ org_id: unknownSourceOrgId, provider: 'desconhecido', data_generation: 4, access_token: 'token', status: 'ok' });
    [reportId] = (await tdb.insert(reports).values({ org_id: orgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim }).returning({ id: reports.id })).map((row) => row.id);
  });

  afterAll(async () => {
    for (const id of [orgId, noSourceOrgId, unknownSourceOrgId]) {
      await tdb.delete(reports).where(eq(reports.org_id, id));
      await tdb.delete(connections).where(eq(connections.org_id, id));
      await tdb.delete(organizations).where(eq(organizations.id, id));
    }
    await sql.end();
  });

  it('reivindica somente uma vez e congela provider/generation mesmo após trocar a conexão ativa', async () => {
    const { claimQueuedReport, getReportById } = await import('@/modules/reports/report.repository');
    const claims = await Promise.all([claimQueuedReport(reportId), claimQueuedReport(reportId)]);

    expect(claims.filter((claim) => claim !== null)).toEqual([{
      orgId, provider: 'olist', sourceGeneration: 7, periodo,
    }]);

    await tdb.update(connections).set({ status: 'erro' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    await tdb.insert(connections).values({ org_id: orgId, provider: 'bling', data_generation: 1, access_token: 'token', status: 'ok' });

    const frozen = await getReportById(reportId, orgId);
    expect(frozen).toMatchObject({ status: 'running', sourceProvider: 'olist', sourceGeneration: 7 });
  });

  it('falha queued sem fonte ERP e não assume uma fonte desconhecida', async () => {
    const { claimQueuedReport } = await import('@/modules/reports/report.repository');
    const [withoutSource, unknownSource] = await tdb.insert(reports).values([
      { org_id: noSourceOrgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
      { org_id: unknownSourceOrgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
    ]).returning({ id: reports.id });

    await expect(claimQueuedReport(withoutSource.id)).resolves.toBeNull();
    await expect(claimQueuedReport(unknownSource.id)).resolves.toBeNull();

    const rows = await tdb.select({ id: reports.id, status: reports.status, erro: reports.erro }).from(reports)
      .where(and(eq(reports.status, 'failed'), eq(reports.erro, 'sem_conexao_erp')));
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining([withoutSource.id, unknownSource.id]));
  });

  it('normaliza reports legados sem fonte para bling generation 1', async () => {
    const { getReportById } = await import('@/modules/reports/report.repository');
    const [legacy] = await tdb.insert(reports).values({ org_id: noSourceOrgId, status: 'done', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim }).returning({ id: reports.id });
    await expect(getReportById(legacy.id, noSourceOrgId)).resolves.toMatchObject({ sourceProvider: 'bling', sourceGeneration: 1 });
  });
});
