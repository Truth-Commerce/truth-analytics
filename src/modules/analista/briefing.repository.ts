import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { analystBriefings, reports, type AnalystBriefingRecord } from '@/db/schema';
import type { BriefingIa } from '@/modules/analista/briefing-ia';

export async function insertBriefing(
  orgId: string,
  reportId: string,
  payload: BriefingIa,
): Promise<void> {
  await db.insert(analystBriefings).values({
    org_id: orgId,
    report_id: reportId,
    payload,
  });
}

/** Pauta do ciclo mais recente (por created_at). Escopado por org_id. */
export async function getBriefingUltimoCiclo(
  orgId: string,
): Promise<AnalystBriefingRecord | null> {
  const [row] = await db
    .select()
    .from(analystBriefings)
    .where(eq(analystBriefings.org_id, orgId))
    .orderBy(desc(analystBriefings.created_at))
    .limit(1);
  return row ?? null;
}

export async function setBriefingIaUsage(
  orgId: string,
  reportId: string,
  usage: unknown,
): Promise<void> {
  await db
    .update(reports)
    .set({ briefing_ia_usage: usage })
    .where(and(eq(reports.id, reportId), eq(reports.org_id, orgId)));
}
