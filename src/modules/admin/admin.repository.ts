import { and, count, desc, eq, exists, ilike, not } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations, reports, users } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import type { OrgStatus, Plano } from '@/modules/auth/user.types';

const PLANOS: readonly Plano[] = ['weekly', 'biweekly', 'monthly'];

export function isValidPlano(value: unknown): value is Plano {
  return typeof value === 'string' && (PLANOS as readonly string[]).includes(value);
}

export type ClientOrganization = {
  id: string;
  name: string;
  status: OrgStatus;
  plano: Plano | null;
  nicho: string | null;
  created_at: Date;
  proximo_relatorio_liberado_em: Date | null;
};

// Org interna = possui ao menos um usuário admin_truth. Clientes = as demais.
function isInternalOrg() {
  return exists(
    db
      .select({ one: users.id })
      .from(users)
      .where(and(eq(users.org_id, organizations.id), eq(users.role, 'admin_truth'))),
  );
}

function rowToClient(row: typeof organizations.$inferSelect): ClientOrganization {
  return {
    id: row.id,
    name: row.name,
    status: row.status as OrgStatus,
    plano: (row.plano as Plano | null) ?? null,
    nicho: row.nicho,
    created_at: row.created_at,
    proximo_relatorio_liberado_em: row.proximo_relatorio_liberado_em,
  };
}

export async function listClientOrganizations(): Promise<ClientOrganization[]> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(isInternalOrg(), false))
    .orderBy(desc(organizations.created_at));
  return rows.map(rowToClient);
}

export async function getOrganizationById(
  orgId: string,
): Promise<ClientOrganization | null> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row ? rowToClient(row) : null;
}

export async function activateOrganization(input: {
  orgId: string;
  plano: Plano;
  actorUserId: string;
}): Promise<void> {
  const updated = await db
    .update(organizations)
    .set({
      status: 'active',
      plano: input.plano,
      proximo_relatorio_liberado_em: new Date(),
    })
    .where(and(eq(organizations.id, input.orgId), not(isInternalOrg())))
    .returning({ id: organizations.id });
  if (updated.length === 0) {
    throw new Error('org_nao_modificavel');
  }
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.ativada',
    detalhes: { plano: input.plano },
  });
}

export async function suspendOrganization(input: {
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  const updated = await db
    .update(organizations)
    .set({ status: 'suspended' })
    .where(and(eq(organizations.id, input.orgId), not(isInternalOrg())))
    .returning({ id: organizations.id });
  if (updated.length === 0) {
    throw new Error('org_nao_modificavel');
  }
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.suspensa',
  });
}

export async function reactivateOrganization(input: {
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  const updated = await db
    .update(organizations)
    .set({ status: 'active' })
    .where(and(eq(organizations.id, input.orgId), not(isInternalOrg())))
    .returning({ id: organizations.id });
  if (updated.length === 0) {
    throw new Error('org_nao_modificavel');
  }
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.reativada',
  });
}

// ─── Admin operacional (Task 10) — leitura cross-org (só admin) ──────────────

export type ConexaoSaude = 'ok' | 'expirado' | 'erro' | 'nenhuma';

function saudeFromRow(status: string | null, accessToken: string | null): ConexaoSaude {
  if (status === null) return 'nenhuma';
  if (status === 'ok' && accessToken !== null) return 'ok';
  if (status === 'expirado') return 'expirado';
  return 'erro';
}

export async function listClientOrganizationsPage(params: {
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: (ClientOrganization & { conexao: ConexaoSaude })[]; total: number }> {
  const filtroNome = params.q ? ilike(organizations.name, `%${params.q}%`) : undefined;
  const where = filtroNome
    ? and(eq(isInternalOrg(), false), filtroNome)
    : eq(isInternalOrg(), false);

  const [{ n }] = await db.select({ n: count() }).from(organizations).where(where);

  const rows = await db
    .select({
      org: organizations,
      connStatus: connections.status,
      connToken: connections.access_token,
    })
    .from(organizations)
    .leftJoin(
      connections,
      and(eq(connections.org_id, organizations.id), eq(connections.provider, 'bling')),
    )
    .where(where)
    .orderBy(desc(organizations.created_at))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return {
    total: n,
    items: rows.map((r) => ({
      ...rowToClient(r.org),
      conexao: saudeFromRow(r.connStatus, r.connToken),
    })),
  };
}

export type OrgReportRow = {
  id: string;
  status: string;
  etapa: string | null;
  periodoInicio: Date;
  periodoFim: Date;
  createdAt: Date;
  erro: string | null;
  iaUsage: { input_tokens: number; output_tokens: number } | null;
};

export async function listOrgReports(orgId: string, limit = 20): Promise<OrgReportRow[]> {
  const rows = await db
    .select({
      id: reports.id,
      status: reports.status,
      etapa: reports.etapa,
      periodo_inicio: reports.periodo_inicio,
      periodo_fim: reports.periodo_fim,
      created_at: reports.created_at,
      erro: reports.erro,
      ia_usage: reports.ia_usage,
    })
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    etapa: r.etapa,
    periodoInicio: r.periodo_inicio,
    periodoFim: r.periodo_fim,
    createdAt: r.created_at,
    erro: r.erro,
    iaUsage: r.ia_usage
      ? {
          input_tokens: Number((r.ia_usage as Record<string, unknown>).input_tokens ?? 0),
          output_tokens: Number((r.ia_usage as Record<string, unknown>).output_tokens ?? 0),
        }
      : null,
  }));
}

export async function getOrgConnectionHealth(orgId: string): Promise<{
  provider: string;
  saude: ConexaoSaude;
  expiraEm: Date | null;
  lastSyncAt: Date | null;
} | null> {
  const [row] = await db
    .select({
      provider: connections.provider,
      status: connections.status,
      access_token: connections.access_token,
      expira_em: connections.expira_em,
      last_sync_at: connections.last_sync_at,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')))
    .limit(1);
  if (!row) return null;
  return {
    provider: row.provider,
    saude: saudeFromRow(row.status, row.access_token),
    expiraEm: row.expira_em,
    lastSyncAt: row.last_sync_at,
  };
}

/**
 * Re-enfileira um report — UPDATE restrito a status='failed' (só admin).
 * Retorna a org do report re-enfileirado, ou null se não estava failed.
 */
export async function requeueFailedReport(input: {
  reportId: string;
  actorUserId: string;
}): Promise<{ orgId: string } | null> {
  let updated: { org_id: string }[];
  try {
    updated = await db
      .update(reports)
      .set({ status: 'queued', etapa: null, erro: null })
      .where(and(eq(reports.id, input.reportId), eq(reports.status, 'failed')))
      .returning({ org_id: reports.org_id });
  } catch (e) {
    // 23505 = unique_violation no índice parcial reports_org_ativo_uq:
    // já existe um report queued/running nesta org.
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new Error('relatorio_em_andamento');
    }
    throw e;
  }
  if (updated.length === 0) return null;
  await recordAudit({
    orgId: updated[0].org_id,
    userId: input.actorUserId,
    acao: 'report.reprocessado',
    detalhes: { reportId: input.reportId },
  });
  return { orgId: updated[0].org_id };
}

/**
 * Nicho editável pelo admin (H3) — normaliza aqui (trim, ''→null, cap 60,
 * mesmo limite do schema de inferência por IA em nicho-ia.ts) para que o
 * valor gravado seja sempre consistente, venha da action ou de outro
 * chamador. Não restringe org interna (mesmo padrão de setMetaMensal): é um
 * atributo descritivo, não uma mudança de status.
 */
export async function updateOrgNicho(orgId: string, nicho: string | null): Promise<void> {
  const trimmed = nicho?.trim() ?? '';
  const value = trimmed === '' ? null : trimmed.slice(0, 60);
  await db.update(organizations).set({ nicho: value }).where(eq(organizations.id, orgId));
}

export async function setPlano(input: {
  orgId: string;
  plano: Plano;
  actorUserId: string;
}): Promise<void> {
  const updated = await db
    .update(organizations)
    .set({ plano: input.plano })
    .where(and(eq(organizations.id, input.orgId), not(isInternalOrg())))
    .returning({ id: organizations.id });
  if (updated.length === 0) {
    throw new Error('org_nao_modificavel');
  }
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.plano_alterado',
    detalhes: { plano: input.plano },
  });
}
