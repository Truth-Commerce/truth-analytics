import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, reports } from '@/db/schema';
import { getLatestDoneReport } from '@/modules/reports/report.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-f1-dash-';
const RUN = Date.now();

describe.skipIf(!url)('report.repository — getLatestDoneReport (F1)', () => {
  let orgId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const base = {
      org_id: orgId,
      periodo_inicio: new Date('2026-06-01'),
      periodo_fim: new Date('2026-06-30'),
    };
    // done antigo, failed recente, done recente — deve voltar o done recente
    await tdb.insert(reports).values({
      ...base,
      status: 'done',
      metricas: { marcador: 'antigo' },
      created_at: new Date('2026-06-10'),
    });
    await tdb.insert(reports).values({
      ...base,
      status: 'failed',
      erro: 'x',
      created_at: new Date('2026-06-20'),
    });
    await tdb.insert(reports).values({
      ...base,
      status: 'done',
      metricas: { marcador: 'recente' },
      created_at: new Date('2026-06-15'),
    });
  });

  afterAll(async () => {
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('retorna o done mais recente, ignorando failed', async () => {
    const rel = await getLatestDoneReport(orgId);
    expect(rel?.status).toBe('done');
    expect(rel?.metricas).toMatchObject({ marcador: 'recente' });
  });

  it('org sem done retorna null', async () => {
    const [vazia] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}vazia-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    expect(await getLatestDoneReport(vazia.id)).toBeNull();
    await tdb.delete(organizations).where(eq(organizations.id, vazia.id));
  });
});
