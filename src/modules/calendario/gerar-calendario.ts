import { and, eq, gte } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { proximasDatas } from '@/lib/calendario-comercial';
import { logger } from '@/lib/logger';
import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { gerarCalendarioComIA } from '@/modules/calendario/calendario-ia';
import { insertSugestoes, setCalendarIaUsage } from '@/modules/calendario/calendario.repository';
import { inicioDoDiaUtc } from '@/modules/calendario/calendario-view-model';
import type { RawOrderItem } from '@/modules/providers/types';
import type { ErpDataSource } from '@/modules/providers/data.types';
import { orderScope } from '@/modules/orders/order-scope';

/** Janela de evidência (dias) — mesma janela usada para as datas comerciais. */
export const JANELA_CALENDARIO_DIAS = 90;

/** Quantidade máxima de produtos mais vendidos enviados ao prompt. */
const TOP_PRODUTOS_LIMITE = 15;

export type GerarCalendarioInput = {
  orgId: string;
  reportId: string;
  orgName: string;
  nicho: string | null;
  provider: ErpDataSource['provider'];
  sourceGeneration: number;
};

/**
 * Gera o calendário sazonal do ciclo — best-effort: caminhos sem sinal/IA
 * retornam null; erros de DB propagam e são capturados pelo try/catch do
 * módulo de extras pós-finalize (pos-finalize-extras.ts).
 */
export async function gerarCalendarioDoCiclo(
  input: GerarCalendarioInput,
): Promise<{ sugestoes: number } | null> {
  const datas = proximasDatas(inicioDoDiaUtc(new Date()), JANELA_CALENDARIO_DIAS).map((d) => ({
    nome: d.nome,
    dataISO: d.data.toISOString().slice(0, 10),
    dica: d.dica,
  }));
  if (datas.length === 0) return null;

  const source = { orgId: input.orgId, provider: input.provider, sourceGeneration: input.sourceGeneration } as const;
  const ancora = await getUltimaDataPedido(source);
  if (!ancora) return null;

  const desde = new Date(ancora.getTime() - JANELA_CALENDARIO_DIAS * 86_400_000);
  const rows = await db
    .select({ itens: orders.itens })
    .from(orders)
    .where(and(orderScope(source), gte(orders.data, desde)));

  const porSku = new Map<string, { nome: string; unidades: number }>();
  for (const o of rows) {
    for (const item of (o.itens as RawOrderItem[]) ?? []) {
      if (!item.sku) continue;
      const atual = porSku.get(item.sku);
      porSku.set(item.sku, {
        nome: atual?.nome ?? item.nome,
        unidades: (atual?.unidades ?? 0) + Number(item.quantidade ?? 0),
      });
    }
  }
  const topProdutos = [...porSku.entries()]
    .sort((a, b) => b[1].unidades - a[1].unidades)
    .slice(0, TOP_PRODUTOS_LIMITE)
    .map(([sku, v]) => ({ sku, nome: v.nome }));
  if (topProdutos.length === 0) return null;

  const resultado = await gerarCalendarioComIA({
    orgName: input.orgName,
    nicho: input.nicho,
    datas,
    topProdutos,
  });

  // Custo é real mesmo quando as sugestões falham (refusal/truncado/parse) —
  // grava o usage sempre que houve ao menos 1 chamada, para a governança de
  // custo nunca descartar gasto já efetuado.
  if (resultado.usage.tentativas > 0) {
    await setCalendarIaUsage(input.orgId, input.reportId, resultado.usage);
  }
  if (!resultado.sugestoes || resultado.sugestoes.length === 0) return null;

  const n = await insertSugestoes(input.orgId, input.reportId, resultado.sugestoes);
  logger.info('calendario.gerado', { orgId: input.orgId, reportId: input.reportId, sugestoes: n });
  return { sugestoes: n };
}
