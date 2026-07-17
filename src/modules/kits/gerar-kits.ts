import { and, eq, gte } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { logger } from '@/lib/logger';
import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { gerarKitsComIA } from '@/modules/kits/kit-ia';
import { candidatosDeKits, type ItemPedido } from '@/modules/kits/market-basket';
import { insertKits, setKitsIaUsage } from '@/modules/kits/kit.repository';

/** Janela de co-ocorrência (dias) — mais longa que o ciclo p/ ter sinal. */
export const JANELA_KITS_DIAS = 90;

export type GerarKitsInput = {
  orgId: string;
  reportId: string;
  orgName: string;
  nicho: string | null;
  ticketMedio: number | null;
};

/**
 * Gera os kits do ciclo — best-effort: retorna null (sem kits) em qualquer
 * caminho sem sinal/IA; NUNCA lança (o hook do orquestrador ainda embrulha em
 * try/catch por segurança).
 */
export async function gerarKitsDoCiclo(input: GerarKitsInput): Promise<{ kits: number } | null> {
  const ancora = await getUltimaDataPedido(input.orgId);
  if (!ancora) return null;

  const desde = new Date(ancora.getTime() - JANELA_KITS_DIAS * 86_400_000);
  const rows = await db
    .select({ itens: orders.itens })
    .from(orders)
    .where(and(eq(orders.org_id, input.orgId), gte(orders.data, desde)));

  const candidatos = candidatosDeKits(
    rows.map((r) => ({ itens: (r.itens as ItemPedido[]) ?? [] })),
  );
  if (candidatos.length === 0) return null;

  const resultado = await gerarKitsComIA({
    orgName: input.orgName,
    nicho: input.nicho,
    candidatos,
    ticketMedio: input.ticketMedio,
  });
  if (!resultado || resultado.kits.length === 0) return null;

  const n = await insertKits(input.orgId, input.reportId, resultado.kits, candidatos);
  await setKitsIaUsage(input.reportId, resultado.usage);
  logger.info('kits.gerados', { orgId: input.orgId, reportId: input.reportId, kits: n });
  return { kits: n };
}
