import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { analystBriefings, cronHeartbeats, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-schemah4-';

describe.skipIf(!url)('schema H4 — analyst_briefings + cron_heartbeats + reports.briefing_ia_usage', () => {
  let orgId = '';
  let reportId = '';
  const rota = `${PREFIX}rota-${RUN}`;

  afterAll(async () => {
    await db.delete(cronHeartbeats).where(eq(cronHeartbeats.rota, rota));
    if (!orgId) return;
    await db.delete(analystBriefings).where(eq(analystBriefings.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('insere briefing e grava briefing_ia_usage no report (roundtrip)', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
      })
      .returning({ id: reports.id });
    reportId = rep!.id;

    const [briefing] = await db
      .insert(analystBriefings)
      .values({
        org_id: orgId,
        report_id: reportId,
        payload: { pauta: ['risco alto', 'estoque baixo'] },
      })
      .returning();
    expect(briefing!.org_id).toBe(orgId);
    expect(briefing!.report_id).toBe(reportId);
    expect((briefing!.payload as { pauta: string[] }).pauta).toEqual(['risco alto', 'estoque baixo']);

    await db
      .update(reports)
      .set({ briefing_ia_usage: { input_tokens: 200, output_tokens: 80, tentativas: 1 } })
      .where(eq(reports.id, reportId));
    const [r] = await db
      .select({ u: reports.briefing_ia_usage })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect((r!.u as { input_tokens: number }).input_tokens).toBe(200);
  });

  it('upsert de heartbeat por rota (2º update na mesma pk atualiza a linha)', async () => {
    const t1 = new Date('2026-07-17T10:00:00Z');
    await db
      .insert(cronHeartbeats)
      .values({ rota, executado_em: t1, ok: true, detalhes: { tentativa: 1 } })
      .onConflictDoUpdate({
        target: cronHeartbeats.rota,
        set: { executado_em: t1, ok: true, detalhes: { tentativa: 1 } },
      });

    const t2 = new Date('2026-07-17T11:00:00Z');
    await db
      .insert(cronHeartbeats)
      .values({ rota, executado_em: t2, ok: false, detalhes: { tentativa: 2, erro: 'timeout' } })
      .onConflictDoUpdate({
        target: cronHeartbeats.rota,
        set: { executado_em: t2, ok: false, detalhes: { tentativa: 2, erro: 'timeout' } },
      });

    const linhas = await db.select().from(cronHeartbeats).where(eq(cronHeartbeats.rota, rota));
    expect(linhas.length).toBe(1);
    expect(linhas[0]!.ok).toBe(false);
    expect(linhas[0]!.executado_em.toISOString()).toBe(t2.toISOString());
    expect(linhas[0]!.detalhes).toEqual({ tentativa: 2, erro: 'timeout' });
  });
});
