import { and, count, countDistinct, eq, gte, lt, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks } from '@/db/schema';
import { logger } from '@/lib/logger';
import { hojeBrt } from '@/lib/timezone';
import { sendDigestSemanalEmail } from '@/modules/notifications/email';
import { getOrgPrimaryUser } from '@/modules/notifications/recipients';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import {
  getTotalVendasMesAnterior,
  getTotalVendasMesCorrente,
} from '@/modules/organizations/organization-settings.repository';

const DIA_MS = 86_400_000;

export type DigestOrg = {
  orgId: string;
  orgName: string;
  /** Distinct tasks com activity status→concluida nos últimos 7 dias. */
  concluidas7d: number;
  /** Não concluídas com prazo < hoje (calendário BRT). */
  atrasadas: number;
  /** status = em_andamento. */
  emAndamento: number;
  vendasMes: number;
  vendasMesAnterior: number;
};

/**
 * Escopo injetável da varredura: o teste de integração restringe à própria
 * org para não varrer orgs de outras suítes no banco compartilhado (lição da
 * Task 7); o cron roda sem escopo (todas as orgs active).
 */
export type EscopoDigest = { orgId: string };

/** "3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento" (singular só na 1ª parte). */
export function linhaResumo(d: Pick<DigestOrg, 'concluidas7d' | 'atrasadas' | 'emAndamento'>): string {
  const concluidas = `${d.concluidas7d} ${d.concluidas7d === 1 ? 'concluída' : 'concluídas'} ✅`;
  return `${concluidas}, ${d.atrasadas} atrasadas ⚠️, ${d.emAndamento} em andamento`;
}

/** Digest da org (null quando não há NENHUMA task — org sem CRM não recebe e-mail). */
export async function montarDigestOrg(
  org: { id: string; name: string },
  agora: Date,
): Promise<DigestOrg | null> {
  const source = await getActiveErpConnection(org.id);
  if (!source) return null;
  const hoje = hojeBrt(agora);
  const corte7d = new Date(agora.getTime() - 7 * DIA_MS);
  const [[total], [concluidas], [atrasadas], [andamento], vendasMes, vendasMesAnterior] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(eq(tasks.org_id, org.id)),
    db
      .select({ n: countDistinct(taskActivities.task_id) })
      .from(taskActivities)
      .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
      .where(
        and(
          eq(tasks.org_id, org.id),
          eq(taskActivities.evento, 'status'),
          eq(taskActivities.para, 'concluida'),
          gte(taskActivities.created_at, corte7d),
        ),
      ),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.org_id, org.id), ne(tasks.status, 'concluida'), lt(tasks.prazo, hoje))),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.org_id, org.id), eq(tasks.status, 'em_andamento'))),
    getTotalVendasMesCorrente(source, agora),
    getTotalVendasMesAnterior(source, agora),
  ]);
  if (Number(total?.n ?? 0) === 0) return null;
  return {
    orgId: org.id,
    orgName: org.name,
    concluidas7d: Number(concluidas?.n ?? 0),
    atrasadas: Number(atrasadas?.n ?? 0),
    emAndamento: Number(andamento?.n ?? 0),
    vendasMes,
    vendasMesAnterior,
  };
}

/**
 * 1 e-mail por org active com tasks (destinatário = usuário client primário).
 * Best-effort por org: falha em uma não aborta as demais.
 */
export async function processarDigestSemanal(
  agora: Date = new Date(),
  escopo?: EscopoDigest,
): Promise<{ orgs: number; enviados: number }> {
  const filtroAtivas = eq(organizations.status, 'active');
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(escopo ? and(filtroAtivas, eq(organizations.id, escopo.orgId)) : filtroAtivas);
  let enviados = 0;
  for (const org of orgs) {
    try {
      const digest = await montarDigestOrg(org, agora);
      if (!digest) continue;
      const user = await getOrgPrimaryUser(org.id);
      if (!user) continue;
      await sendDigestSemanalEmail(user.email, {
        orgName: digest.orgName,
        resumo: linhaResumo(digest),
        vendasMes: digest.vendasMes,
        vendasMesAnterior: digest.vendasMesAnterior,
      });
      enviados += 1;
    } catch (err) {
      logger.warn('digest semanal falhou para org', { orgId: org.id }, err);
    }
  }
  return { orgs: orgs.length, enviados };
}
