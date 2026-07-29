import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { pLimit } from '@/lib/p-limit';
import { criarPortao } from '@/lib/rate-gate';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { CANAL_DESCONHECIDO, fetchCanaisVenda } from '@/modules/providers/bling/canais';
import { fetchOrderDetail } from '@/modules/providers/bling/order-detail';
import type { Periodo } from '@/modules/providers/types';

/**
 * Teto de vazão do Bling: 3 req/s. 340ms entre inícios ≈ 2,94 req/s — margem de
 * segurança deliberada, porque estourar custa bloqueio de IP por 10 minutos.
 */
const INTERVALO_MS = 340;
/** Concorrência só esconde a latência; quem fixa a taxa é o portão. */
const CONCORRENCIA = 3;

export type EnrichOptions = {
  /** Teto de pedidos nesta execução. */
  maxPedidos: number;
  /** Prazo de parede em ms; para de pegar novos pedidos ao estourar. */
  prazoMs: number;
  /** Se informado, prioriza os pedidos do período (o que o relatório vai ler). */
  periodo?: Periodo;
};

export type EnrichResult = {
  enriquecidos: number;
  falhas: number;
  restantes: number;
  /** true = ainda há fila; vale chamar de novo na próxima execução. */
  incompleto: boolean;
};

/** Fila: pedidos desta org que ainda não tiveram o detalhe lido. */
async function pedidosPendentes(
  orgId: string,
  limite: number,
  periodo?: Periodo,
): Promise<{ id: string; blingOrderId: string }[]> {
  const filtros = [
    eq(orders.org_id, orgId),
    eq(orders.provider, 'bling'),
    isNotNull(orders.bling_order_id),
    isNull(orders.enriquecido_em),
  ];
  if (periodo) {
    filtros.push(gte(orders.data, periodo.inicio), lte(orders.data, periodo.fim));
  }
  const linhas = await db
    .select({ id: orders.id, blingOrderId: orders.bling_order_id })
    .from(orders)
    .where(and(...filtros))
    // Mais recentes primeiro: se o orçamento acabar, o que sobra sem detalhe é o
    // histórico antigo, não o período que o cliente está olhando agora.
    .orderBy(sql`${orders.data} desc`)
    .limit(limite);
  return linhas.filter(
    (linha): linha is { id: string; blingOrderId: string } => linha.blingOrderId !== null,
  );
}

async function contarPendentes(orgId: string): Promise<number> {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), isNull(orders.enriquecido_em)));
  return linha?.n ?? 0;
}

/**
 * Enriquecimento incremental: lê o detalhe de cada pedido pendente e grava
 * `itens`, `frete` e `comissao` — os três campos que a listagem NÃO entrega.
 *
 * Por que não fica dentro da coleta: é 1 requisição por pedido. A 2,94 req/s,
 * uma carteira de ~2.900 pedidos leva ~17 minutos, muito além do maxDuration=300
 * da Vercel. Então roda por orçamento (teto de pedidos + prazo), marca cada linha
 * com `enriquecido_em` e retoma de onde parou na execução seguinte. O sync diário
 * traz poucas dezenas de pedidos novos, então em regime a fila fica vazia.
 *
 * BEST-EFFORT por design: falha de um pedido não contamina os outros, e falha
 * geral não derruba o relatório — um relatório com itens parciais é melhor que
 * nenhum relatório. O chamador não precisa de try/catch.
 */
export async function enrichOrders(
  orgId: string,
  opts: EnrichOptions,
): Promise<EnrichResult> {
  const log = createLogger({ orgId });
  const limite = new Date(Date.now() + opts.prazoMs);
  let enriquecidos = 0;
  let falhas = 0;

  try {
    const pendentes = await pedidosPendentes(orgId, opts.maxPedidos, opts.periodo);
    if (pendentes.length === 0) {
      return { enriquecidos: 0, falhas: 0, restantes: 0, incompleto: false };
    }

    const token = await getValidAccessToken(orgId);
    const canais = await fetchCanaisVenda(orgId, token);
    const portao = criarPortao(INTERVALO_MS);
    const limitarConcorrencia = pLimit(CONCORRENCIA);

    await Promise.all(
      pendentes.map((pedido) =>
        limitarConcorrencia(async () => {
          if (Date.now() >= limite.getTime()) return; // prazo estourou: não começa novos
          await portao();

          try {
            const detalhe = await fetchOrderDetail(pedido.blingOrderId, token);
            const canalResolvido = detalhe.canalId
              ? canais.get(detalhe.canalId)
              : undefined;

            await db
              .update(orders)
              .set({
                itens: detalhe.itens,
                frete: String(detalhe.frete),
                comissao: String(detalhe.comissao),
                enriquecido_em: new Date(),
                // Só toca no canal quando resolveu de fato — nunca rebaixa um
                // nome bom de volta para o fallback.
                ...(canalResolvido && canalResolvido !== CANAL_DESCONHECIDO
                  ? { canal: canalResolvido.slice(0, 32) }
                  : {}),
              })
              .where(and(eq(orders.id, pedido.id), eq(orders.org_id, orgId)));

            enriquecidos++;
          } catch (err) {
            falhas++;
            log.warn('enriquecimento: pedido falhou', {
              blingOrderId: pedido.blingOrderId,
              erro: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      ),
    );

    const restantes = await contarPendentes(orgId);
    log.info('enriquecimento concluido', { enriquecidos, falhas, restantes });
    return { enriquecidos, falhas, restantes, incompleto: restantes > 0 };
  } catch (err) {
    // Falha estrutural (token inválido, banco fora): nunca derruba o chamador.
    log.warn('enriquecimento abortado', {
      erro: err instanceof Error ? err.message : String(err),
      enriquecidos,
      falhas,
    });
    return { enriquecidos, falhas, restantes: -1, incompleto: true };
  }
}
