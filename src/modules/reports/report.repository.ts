import { and, asc, desc, eq, gt, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { hasPostgresErrorCode } from '@/db/postgres-error';
import { connections, reports } from '@/db/schema';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { isErpProviderId } from '@/modules/providers/provider-catalog';
import type { ErpProviderId } from '@/modules/providers/types';

import type { ReportDetail, ReportStatus, ReportSummary } from './report.types';

type ReportRow = typeof reports.$inferSelect;

// Apenas as colunas de summary — evita puxar os jsonb pesados (metricas/analise_ia)
// na listagem. Ordena por created_at desc (usa reports_org_created_idx).
const summaryColumns = {
  id: reports.id,
  status: reports.status,
  source_provider: reports.source_provider,
  source_generation: reports.source_generation,
  periodo_inicio: reports.periodo_inicio,
  periodo_fim: reports.periodo_fim,
  created_at: reports.created_at,
};

type SummaryRow = {
  id: string;
  status: string;
  source_provider: string | null;
  source_generation: number | null;
  periodo_inicio: Date;
  periodo_fim: Date;
  created_at: Date;
};

function frozenSource(provider: string | null, generation: number | null): Pick<ReportSummary, 'sourceProvider' | 'sourceGeneration'> {
  // Somente o par integralmente ausente é legado. Uma fonte parcial ou um
  // provider desconhecido não pode ser reinterpretado como Bling: escondemos
  // ambos para que leitores não consumam uma fonte errada.
  if (provider === null && generation === null) {
    return { sourceProvider: 'bling', sourceGeneration: 1 };
  }
  if (provider !== null && generation !== null && isErpProviderId(provider)) {
    return { sourceProvider: provider, sourceGeneration: generation };
  }
  return {};
}

function summaryRowToSummary(row: SummaryRow): ReportSummary {
  return {
    id: row.id,
    status: row.status as ReportStatus,
    ...frozenSource(row.source_provider, row.source_generation),
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
    ...frozenSource(row.source_provider, row.source_generation),
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

export type HistoricoDashboardRow = ReportSummary & {
  /** Extraído no SQL de metricas->'truth_score'->>'score' (null p/ failed/antigo). */
  score: number | null;
  /** Extraído no SQL de metricas->'truth_score'->>'totalPeriodo'. */
  totalPeriodo: number | null;
};

/**
 * Histórico do dashboard em UMA query leve: summaries + score/faturamento do
 * Truth Score extraídos do jsonb NO BANCO (sem puxar metricas/analise_ia
 * inteiros). Serve o histórico, o `latest` (primeira linha) e a linha do
 * tempo do score. Desc por created_at; escopado por org_id.
 */
export async function listHistoricoDashboard(
  orgId: string,
  limite = LIST_LIMIT,
): Promise<HistoricoDashboardRow[]> {
  const rows = await db
    .select({
      ...summaryColumns,
      score: sql<string | null>`(${reports.metricas}->'truth_score'->>'score')`,
      total_periodo: sql<string | null>`(${reports.metricas}->'truth_score'->>'totalPeriodo')`,
    })
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(limite);
  return rows.map((row) => ({
    ...summaryRowToSummary(row),
    score: row.score === null ? null : Number(row.score),
    totalPeriodo: row.total_periodo === null ? null : Number(row.total_periodo),
  }));
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

/** Done mais ANTIGO da org — a "foto de entrada" do cliente na consultoria. */
export async function getPrimeiroDoneReport(orgId: string): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(asc(reports.created_at))
    .limit(1);
  return row ? rowToDetail(row) : null;
}

/**
 * Done mais próximo de `ref`: o mais recente com created_at <= ref; se não
 * houver (task mais velha que qualquer relatório), o mais antigo depois de
 * ref. Baseline de impacto p/ tasks sem report_id (decisão da auditoria G3).
 */
export async function getDoneMaisProximo(orgId: string, ref: Date): Promise<ReportDetail | null> {
  const [antes] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done'), lte(reports.created_at, ref)))
    .orderBy(desc(reports.created_at))
    .limit(1);
  if (antes) return rowToDetail(antes);
  const [depois] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done'), gt(reports.created_at, ref)))
    .orderBy(asc(reports.created_at))
    .limit(1);
  return depois ? rowToDetail(depois) : null;
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
    if (hasPostgresErrorCode(e, '23505')) {
      throw new Error('relatorio_em_andamento');
    }
    throw e;
  }
}

export type QueuedReportClaim = {
  orgId: string;
  provider: ErpProviderId;
  sourceGeneration: number;
  periodo: { inicio: Date; fim: Date };
};

/**
 * Assume um relatório queued e fixa a fonte de dados na mesma transação.
 * O lock da linha do report faz com que exatamente um worker consiga avançar
 * para running; se não houver uma fonte ERP válida, o report termina failed.
 */
export async function claimQueuedReport(reportId: string): Promise<QueuedReportClaim | null> {
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({
        orgId: reports.org_id,
        periodoInicio: reports.periodo_inicio,
        periodoFim: reports.periodo_fim,
      })
      .from(reports)
      .where(and(eq(reports.id, reportId), eq(reports.status, 'queued')))
      .for('update')
      .limit(1);
    if (!report) return null;

    const [source] = await tx
      .select({ provider: connections.provider, sourceGeneration: connections.data_generation })
      .from(connections)
      .where(and(
        eq(connections.org_id, report.orgId),
        eq(connections.status, 'ok'),
        isNotNull(connections.access_token),
      ))
      .for('update')
      .limit(1);

    if (!source || !isErpProviderId(source.provider)) {
      await tx.update(reports).set({ status: 'failed', erro: 'sem_conexao_erp' })
        .where(and(eq(reports.id, reportId), eq(reports.status, 'queued')));
      return null;
    }

    await tx.update(reports).set({
      status: 'running',
      source_provider: source.provider,
      source_generation: source.sourceGeneration,
      erro: null,
    }).where(and(eq(reports.id, reportId), eq(reports.status, 'queued')));

    return {
      orgId: report.orgId,
      provider: source.provider,
      sourceGeneration: source.sourceGeneration,
      periodo: { inicio: report.periodoInicio, fim: report.periodoFim },
    };
  });
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
