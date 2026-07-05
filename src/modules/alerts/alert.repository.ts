import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { alerts } from '@/db/schema';
import type { AlertaCandidato } from './alert-detectors';

export type AlertaAberto = {
  id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  corpo: string;
  chaveDedup: string;
  createdAt: Date;
};

/**
 * Lista os alertas ABERTOS (resolvido = false) de uma organização, mais
 * recentes primeiro. Escopado por org_id — nunca vaza alertas de outra org.
 * A chave de dedup é lida de `dados.chave_dedup`.
 */
export async function listAlertasAbertos(orgId: string): Promise<AlertaAberto[]> {
  const rows = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.org_id, orgId), eq(alerts.resolvido, false)))
    .orderBy(desc(alerts.created_at));
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    severidade: r.severidade,
    titulo: r.titulo,
    corpo: r.corpo,
    chaveDedup: String((r.dados as Record<string, unknown>)?.chave_dedup ?? ''),
    createdAt: r.created_at,
  }));
}

/**
 * Insere candidatos para uma org (chaveDedup vai para `dados.chave_dedup`).
 * Retorna os ids criados na mesma ordem. Lista vazia → nenhum insert.
 */
export async function criarAlertas(
  orgId: string,
  candidatos: AlertaCandidato[],
): Promise<string[]> {
  if (candidatos.length === 0) return [];
  const rows = await db
    .insert(alerts)
    .values(
      candidatos.map((c) => ({
        org_id: orgId,
        tipo: c.tipo,
        severidade: c.severidade,
        titulo: c.titulo,
        corpo: c.corpo,
        dados: { ...c.dados, chave_dedup: c.chaveDedup },
      })),
    )
    .returning({ id: alerts.id });
  return rows.map((r) => r.id);
}

/**
 * Marca um alerta como resolvido — escopado por org (multi-tenancy) e só afeta
 * alertas ainda abertos. Retorna false se o alerta não existir, pertencer a
 * outra org, ou já estiver resolvido.
 */
export async function resolverAlerta(alertId: string, orgId: string): Promise<boolean> {
  const updated = await db
    .update(alerts)
    .set({ resolvido: true, resolvido_em: new Date() })
    .where(
      and(eq(alerts.id, alertId), eq(alerts.org_id, orgId), eq(alerts.resolvido, false)),
    )
    .returning({ id: alerts.id });
  return updated.length > 0;
}
