import { and, eq, gte } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { logger } from '@/lib/logger';
import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { gerarKitsComIA } from '@/modules/kits/kit-ia';
import { candidatosDeKits, type ItemPedido } from '@/modules/kits/market-basket';
import type { ErpDataSource } from '@/modules/providers/data.types';
import { orderScope } from '@/modules/orders/order-scope';
import { insertKits, setKitsIaUsage } from '@/modules/kits/kit.repository';

/** Janela de co-ocorrência (dias) — mais longa que o ciclo p/ ter sinal. */
export const JANELA_KITS_DIAS = 90;

export type GerarKitsInput = {
  orgId: string;
  reportId: string;
  orgName: string;
  nicho: string | null;
  ticketMedio: number | null;
  provider: ErpDataSource['provider'];
  sourceGeneration: number;
};

/**
 * Gera os kits do ciclo — best-effort: caminhos sem sinal/IA retornam null;
 * erros de DB propagam e são capturados pelo try/catch do módulo de extras
 * pós-finalize (pos-finalize-extras.ts).
 */
export async function gerarKitsDoCiclo(input: GerarKitsInput): Promise<{ kits: number } | null> {
  const source = { orgId: input.orgId, provider: input.provider, sourceGeneration: input.sourceGeneration } as const;
  const ancora = await getUltimaDataPedido(source);
  if (!ancora) return null;

  const desde = new Date(ancora.getTime() - JANELA_KITS_DIAS * 86_400_000);
  const rows = await db
    .select({ itens: orders.itens })
    .from(orders)
    .where(and(orderScope(source), gte(orders.data, desde)));

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

  // Custo é real mesmo quando os kits falham (refusal/truncado/parse) — grava
  // o usage sempre que houve ao menos 1 chamada, para a governança de custo
  // nunca descartar gasto já efetuado.
  if (resultado.usage.tentativas > 0) {
    await setKitsIaUsage(input.orgId, input.reportId, resultado.usage);
  }
  if (!resultado.kits || resultado.kits.length === 0) return null;

  const n = await insertKits(input.orgId, input.reportId, resultado.kits, candidatos);
  logger.info('kits.gerados', { orgId: input.orgId, reportId: input.reportId, kits: n });
  return { kits: n };
}
