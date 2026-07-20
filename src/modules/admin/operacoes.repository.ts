/**
 * I/O do Centro de operações (H4 T10) — leitura cross-org (só admin),
 * contraparte não pura de `custo-ia.ts`/`operacoes-view.ts`: aqui só busca
 * dado (join, filtro, paginação); qualquer decisão de agregação/frescor/
 * custo mora nos módulos puros.
 */
import { and, desc, eq, exists, gte, ilike, inArray, lte, not } from 'drizzle-orm';

import { db } from '@/db/client';
import { auditLog, connections, organizations, reports, users } from '@/db/schema';
import type { ConexaoSaude } from '@/modules/admin/admin.repository';
import type { ReportUsageRow, UsageJsonLike } from '@/modules/admin/custo-ia';
import { diasAteExpirar } from '@/modules/admin/operacoes-view';

// ─── Fila de relatórios cross-org ────────────────────────────────────────

export type FilaRelatorioRow = {
  id: string;
  orgId: string;
  orgName: string;
  status: string;
  etapa: string | null;
  erro: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const STATUS_FILA = ['queued', 'running', 'failed'] as const;

/** queued/running/failed de TODAS as orgs, dos últimos `desde` (30d na página). */
export async function listFilaRelatorios(desde: Date): Promise<FilaRelatorioRow[]> {
  const rows = await db
    .select({
      id: reports.id,
      orgId: reports.org_id,
      orgName: organizations.name,
      status: reports.status,
      etapa: reports.etapa,
      erro: reports.erro,
      createdAt: reports.created_at,
      updatedAt: reports.updated_at,
    })
    .from(reports)
    .innerJoin(organizations, eq(reports.org_id, organizations.id))
    .where(and(inArray(reports.status, [...STATUS_FILA]), gte(reports.created_at, desde)))
    .orderBy(desc(reports.created_at));
  return rows;
}

// ─── Custo IA do mês — rows para o puro `custoIaDoMes` ──────────────────

function toUsageJson(v: unknown): UsageJsonLike {
  return (v ?? null) as UsageJsonLike;
}

/** Rows de reports do período (inclusive) com as 4 fontes jsonb de usage + nome da org, para `custoIaDoMes`. */
export async function listReportsUsageMes(
  inicio: Date,
  fim: Date,
): Promise<(ReportUsageRow & { orgName: string })[]> {
  const rows = await db
    .select({
      orgId: reports.org_id,
      orgName: organizations.name,
      iaUsage: reports.ia_usage,
      kitsIaUsage: reports.kits_ia_usage,
      calendarIaUsage: reports.calendar_ia_usage,
      briefingIaUsage: reports.briefing_ia_usage,
    })
    .from(reports)
    .innerJoin(organizations, eq(reports.org_id, organizations.id))
    .where(and(gte(reports.created_at, inicio), lte(reports.created_at, fim)));

  return rows.map((r) => ({
    orgId: r.orgId,
    orgName: r.orgName,
    iaUsage: toUsageJson(r.iaUsage),
    kitsIaUsage: toUsageJson(r.kitsIaUsage),
    calendarIaUsage: toUsageJson(r.calendarIaUsage),
    briefingIaUsage: toUsageJson(r.briefingIaUsage),
  }));
}

// ─── Conexões — saúde em lote ─────────────────────────────────────────────

/**
 * Org interna = possui ao menos um usuário admin_truth — mesmo critério de
 * `isInternalOrg`/`saudeFromRow` em admin.repository.ts, duplicado aqui
 * localmente (função de poucas linhas) para não acoplar este módulo novo a
 * um repositório de outra tela — mesma decisão já tomada para `saudeConexao`
 * em carteira-data.repository.ts.
 */
function isInternalOrg() {
  return exists(
    db
      .select({ one: users.id })
      .from(users)
      .where(and(eq(users.org_id, organizations.id), eq(users.role, 'admin_truth'))),
  );
}

function saudeFromRow(status: string | null, accessToken: string | null): ConexaoSaude {
  if (status === null) return 'nenhuma';
  if (status === 'ok' && accessToken !== null) return 'ok';
  if (status === 'expirado') return 'expirado';
  return 'erro';
}

export type ConexaoOrgRow = {
  orgId: string;
  orgName: string;
  saude: ConexaoSaude;
  expiraEm: Date | null;
  diasAteExpirar: number | null;
  lastSyncAt: Date | null;
};

/** Saúde de conexão (Bling) de TODAS as orgs cliente, em UMA query batched. */
export async function listConexoesSaude(agora: Date = new Date()): Promise<ConexaoOrgRow[]> {
  const rows = await db
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      status: connections.status,
      accessToken: connections.access_token,
      expiraEm: connections.expira_em,
      lastSyncAt: connections.last_sync_at,
    })
    .from(organizations)
    .leftJoin(
      connections,
      and(eq(connections.org_id, organizations.id), eq(connections.provider, 'bling')),
    )
    .where(not(isInternalOrg()))
    .orderBy(organizations.name);

  return rows.map((r) => ({
    orgId: r.orgId,
    orgName: r.orgName,
    saude: saudeFromRow(r.status ?? null, r.accessToken ?? null),
    expiraEm: r.expiraEm,
    diasAteExpirar: diasAteExpirar(r.expiraEm, agora),
    lastSyncAt: r.lastSyncAt,
  }));
}

// ─── Audit log — últimos 100, filtrado ───────────────────────────────────

export type AuditLogRow = {
  id: string;
  orgId: string | null;
  orgName: string | null;
  userId: string | null;
  acao: string;
  detalhes: unknown;
  createdAt: Date;
};

/** Universo máximo lido do audit log (mais recentes primeiro) antes de paginar — "últimos 100" da spec. */
const AUDIT_MAX_ROWS = 100;
export const AUDIT_PAGE_SIZE = 20;

/**
 * Lê os últimos `AUDIT_MAX_ROWS` do audit log que casam os filtros (org
 * exata, ação por substring, período), depois pagina EM MEMÓRIA sobre esse
 * conjunto pequeno e já ordenado — evita subquery para uma tela de auditoria
 * cujo teto é sempre 100 linhas.
 */
export async function listAuditLogFiltrado(params: {
  orgId?: string;
  acao?: string;
  desde?: Date;
  ate?: Date;
  page: number;
}): Promise<{ items: AuditLogRow[]; total: number; pageCount: number }> {
  const condicoes = [
    params.orgId ? eq(auditLog.org_id, params.orgId) : undefined,
    params.acao ? ilike(auditLog.acao, `%${params.acao}%`) : undefined,
    params.desde ? gte(auditLog.created_at, params.desde) : undefined,
    params.ate ? lte(auditLog.created_at, params.ate) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  const where = condicoes.length > 0 ? and(...condicoes) : undefined;

  const rows = await db
    .select({
      id: auditLog.id,
      orgId: auditLog.org_id,
      orgName: organizations.name,
      userId: auditLog.user_id,
      acao: auditLog.acao,
      detalhes: auditLog.detalhes,
      createdAt: auditLog.created_at,
    })
    .from(auditLog)
    .leftJoin(organizations, eq(auditLog.org_id, organizations.id))
    .where(where)
    .orderBy(desc(auditLog.created_at))
    .limit(AUDIT_MAX_ROWS);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, params.page), pageCount);
  const items = rows.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);
  return { items, total, pageCount };
}
