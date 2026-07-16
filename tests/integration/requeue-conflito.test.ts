import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, reports } from '@/db/schema';
import { requeueFailedReport } from '@/modules/admin/admin.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-requeue-';
const DIA = 86_400_000;

describe.skipIf(!url)('requeueFailedReport — corrida com o índice reports_org_ativo_uq', () => {
  let orgId = '';
  let failedId = '';

  beforeAll(async () => {
    const agora = new Date();
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const base = {
      org_id: orgId,
      periodo_inicio: new Date(agora.getTime() - 8 * DIA),
      periodo_fim: new Date(agora.getTime() - DIA),
    };
    // 1 report ATIVO (queued) + 1 failed na MESMA org
    await db.insert(reports).values({ ...base, status: 'queued' });
    const [failed] = await db
      .insert(reports)
      .values({ ...base, status: 'failed', erro: 'coleta_falhou' })
      .returning({ id: reports.id });
    failedId = failed!.id;
  });

  afterAll(async () => {
    await db.delete(auditLog).where(eq(auditLog.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('com outro report ativo na org, lança relatorio_em_andamento (não 23505 cru)', async () => {
    await expect(
      requeueFailedReport({ reportId: failedId, actorUserId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow('relatorio_em_andamento');
  });
});
