import { and, desc, eq, exists, not } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
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
