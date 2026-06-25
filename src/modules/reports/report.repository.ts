import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

import type { ReportDetail, ReportStatus, ReportSummary } from './report.types';

type ReportRow = typeof reports.$inferSelect;

function rowToSummary(row: ReportRow): ReportSummary {
  return {
    id: row.id,
    status: row.status as ReportStatus,
    periodoInicio: row.periodo_inicio,
    periodoFim: row.periodo_fim,
    createdAt: row.created_at,
  };
}

function rowToDetail(row: ReportRow): ReportDetail {
  return {
    ...rowToSummary(row),
    metricas: (row.metricas as Metricas | null) ?? null,
    analiseIa: (row.analise_ia as AnaliseIa | null) ?? null,
    erro: row.erro ?? null,
  };
}

export async function listReports(orgId: string): Promise<ReportSummary[]> {
  const rows = await db
    .select()
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at));
  return rows.map(rowToSummary);
}

export async function getLatestReport(orgId: string): Promise<ReportSummary | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? rowToSummary(row) : null;
}

export async function getReportById(
  reportId: string,
  orgId: string,
): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.org_id, orgId)))
    .limit(1);
  return row ? rowToDetail(row) : null;
}
