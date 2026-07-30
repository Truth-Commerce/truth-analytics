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
  let inactiveOrgId = '';
  let reportId = '';

  beforeAll(async () => {
    [orgId, noSourceOrgId, unknownSourceOrgId, inactiveOrgId] = await Promise.all(
      ['claim', 'sem-source', 'source-desconhecida', 'inativa'].map(async (name) => {
        const [org] = await tdb.insert(organizations).values({ name: `ta-${name}-${RUN}`, status: 'active' }).returning({ id: organizations.id });
        return org.id;
      }),
    );
    await tdb.insert(connections).values({ org_id: orgId, provider: 'olist', data_generation: 7, access_token: 'token', status: 'ok' });
    await tdb.insert(connections).values({ org_id: unknownSourceOrgId, provider: 'desconhecido', data_generation: 4, access_token: 'token', status: 'ok' });
    await tdb.update(organizations).set({ status: 'pending' }).where(eq(organizations.id, inactiveOrgId));
    await tdb.insert(connections).values({ org_id: inactiveOrgId, provider: 'bling', data_generation: 1, access_token: 'token', status: 'ok' });
    [reportId] = (await tdb.insert(reports).values({ org_id: orgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim }).returning({ id: reports.id })).map((row) => row.id);
  });

  afterAll(async () => {
    for (const id of [orgId, noSourceOrgId, unknownSourceOrgId, inactiveOrgId]) {
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
    expect(frozen).toMatchObject({
      status: 'running',
      sourceProvider: 'olist',
      sourceGeneration: 7,
    });
    const [stored] = await tdb.select({ etapa: reports.etapa }).from(reports)
      .where(eq(reports.id, reportId));
    expect(stored.etapa).toBe('coletando_vendas');
  });

  it('persiste failed e lança sem_conexao_erp sem fonte ou com provider desconhecido', async () => {
    const { claimQueuedReport } = await import('@/modules/reports/report.repository');
    const [withoutSource, unknownSource] = await tdb.insert(reports).values([
      { org_id: noSourceOrgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
      { org_id: unknownSourceOrgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
    ]).returning({ id: reports.id });

    await expect(claimQueuedReport(withoutSource.id)).rejects.toThrow('sem_conexao_erp');
    await expect(claimQueuedReport(unknownSource.id)).rejects.toThrow('sem_conexao_erp');

    const rows = await tdb.select({ id: reports.id, status: reports.status, erro: reports.erro }).from(reports)
      .where(and(eq(reports.status, 'failed'), eq(reports.erro, 'sem_conexao_erp')));
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining([withoutSource.id, unknownSource.id]));
  });

  it('rejeita org inativa, preservando sua etapa após marcar failed', async () => {
    const { claimQueuedReport } = await import('@/modules/reports/report.repository');
    const [inactive] = await tdb.insert(reports).values({
      org_id: inactiveOrgId,
      status: 'queued',
      etapa: 'analisando_mercado',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
    }).returning({ id: reports.id });

    await expect(claimQueuedReport(inactive.id)).rejects.toThrow('sem_conexao_erp');

    const [stored] = await tdb.select({ status: reports.status, etapa: reports.etapa })
      .from(reports).where(eq(reports.id, inactive.id));
    expect(stored).toEqual({ status: 'failed', etapa: 'analisando_mercado' });
  });

  it('normaliza apenas done legado sem fonte para bling generation 1', async () => {
    const { getReportById } = await import('@/modules/reports/report.repository');
    const [legacy] = await tdb.insert(reports).values({ org_id: noSourceOrgId, status: 'done', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim }).returning({ id: reports.id });
    await expect(getReportById(legacy.id, noSourceOrgId)).resolves.toMatchObject({ sourceProvider: 'bling', sourceGeneration: 1 });
  });

  it('expõe campos de fonte nulos para queued/running e fontes inválidas', async () => {
    const { getReportById } = await import('@/modules/reports/report.repository');
    const [queued, running, partial, unknown, invalidGeneration] = await tdb.insert(reports).values([
      { org_id: noSourceOrgId, status: 'queued', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
      { org_id: noSourceOrgId, status: 'running', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
      { org_id: noSourceOrgId, status: 'done', source_provider: 'olist', periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
      { org_id: noSourceOrgId, status: 'done', source_provider: 'desconhecido', source_generation: 4, periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
      { org_id: noSourceOrgId, status: 'done', source_provider: 'olist', source_generation: 0, periodo_inicio: periodo.inicio, periodo_fim: periodo.fim },
    ]).returning({ id: reports.id });

    for (const report of [queued, running, partial, unknown, invalidGeneration]) {
      await expect(getReportById(report.id, noSourceOrgId)).resolves.toMatchObject({
        sourceProvider: null,
        sourceGeneration: null,
      });
    }
  });
});
