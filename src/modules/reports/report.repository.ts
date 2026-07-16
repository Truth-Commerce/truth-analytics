import { and, desc, eq, gt, lt, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

import type { ReportDetail, ReportStatus, ReportSummary } from './report.types';

type ReportRow = typeof reports.$inferSelect;

// Apenas as colunas de summary — evita puxar os jsonb pesados (metricas/analise_ia)
// na listagem. Ordena por created_at desc (usa reports_org_created_idx).
const summaryColumns = {
  id: reports.id,
  status: reports.status,
  periodo_inicio: reports.periodo_inicio,
  periodo_fim: reports.periodo_fim,
  created_at: reports.created_at,
};

type SummaryRow = {
  id: string;
  status: string;
  periodo_inicio: Date;
  periodo_fim: Date;
  created_at: Date;
};

function summaryRowToSummary(row: SummaryRow): ReportSummary {
  return {
    id: row.id,
    status: row.status as ReportStatus,
    periodoInicio: row.periodo_inicio,
    periodoFim: row.periodo_fim,
    createdAt: row.created_at,
  };
}

const LIST_LIMIT = 50;

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
    .select(summaryColumns)
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(LIST_LIMIT);
  return rows.map(summaryRowToSummary);
}

export async function getLatestReport(orgId: string): Promise<ReportSummary | null> {
  const [row] = await db
    .select(summaryColumns)
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? summaryRowToSummary(row) : null;
}

/**
 * Summaries só de relatórios `done` (p/ selects do comparativo). Limit 50.
 * Mesmo padrão de `listReports`, acrescentando o filtro de status.
 */
export async function listDoneReports(orgId: string): Promise<ReportSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(desc(reports.created_at))
    .limit(LIST_LIMIT);
  return rows.map(summaryRowToSummary);
}

/**
 * Últimos relatórios `done` COM métricas (mais recente primeiro). Usado para
 * montar o hero do Truth Score (atual + anterior) no dashboard.
 */
export async function getUltimosDoneDetalhados(
  orgId: string,
  limite = 2,
): Promise<ReportDetail[]> {
  const rows = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(desc(reports.created_at))
    .limit(limite);
  return rows.map(rowToDetail);
}

export async function getLatestDoneReport(orgId: string): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? rowToDetail(row) : null;
}

/**
 * Report `done` mais recente da org, POSTERIOR a `afterCreatedAt` e diferente
 * de `excludeId` — usado por `getTaskImpact` (Task 10) para achar o
 * "relatório mais recente" contra o qual medir o impacto de uma task, a
 * partir do relatório de origem que a gerou.
 */
export async function getLatestDoneReportAfter(
  orgId: string,
  afterCreatedAt: Date,
  excludeId: string,
): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.org_id, orgId),
        eq(reports.status, 'done'),
        gt(reports.created_at, afterCreatedAt),
        ne(reports.id, excludeId),
      ),
    )
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? rowToDetail(row) : null;
}

/**
 * Done imediatamente ANTERIOR a um relatório (por created_at), escopado por
 * org. Base do hero de KPIs e do default do comparativo.
 */
export async function getDoneAnterior(
  orgId: string,
  beforeCreatedAt: Date,
  excludeId: string,
): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.org_id, orgId),
        eq(reports.status, 'done'),
        lt(reports.created_at, beforeCreatedAt),
        ne(reports.id, excludeId),
      ),
    )
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? rowToDetail(row) : null;
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

export async function createQueuedReport(
  orgId: string,
  periodo: { inicio: Date; fim: Date },
): Promise<string> {
  try {
    const [row] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'queued',
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
      })
      .returning({ id: reports.id });
    return row.id;
  } catch (e: unknown) {
    // 23505 = unique_violation no índice parcial reports_org_ativo_uq
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new Error('relatorio_em_andamento');
    }
    throw e;
  }
}

/**
 * Marca o report como failed SOMENTE se ainda estiver 'queued' (compare-and-set).
 *
 * Usado no caminho de falha do dispatch da action: se o self-POST /api/pipeline/run
 * já foi aceito (202) e o pipeline avançou o report para running/done em background,
 * um fetch que rejeite depois NÃO pode reverter o report para failed. O predicado
 * `status = 'queued'` fecha esse TOCTOU: 0 linhas afetadas → o pipeline já assumiu,
 * deixamos como está.
 *
 * @returns true se o report foi marcado failed; false se já havia avançado.
 */
export async function markReportFailed(reportId: string, erro: string): Promise<boolean> {
  const rows = await db
    .update(reports)
    .set({ status: 'failed', erro })
    .where(and(eq(reports.id, reportId), eq(reports.status, 'queued')))
    .returning({ id: reports.id });
  return rows.length > 0;
}
