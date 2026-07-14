import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { BACKOFF_FALHA_DIAS } from './scheduler.service';

/**
 * Orgs elegíveis para geração automática: active + plano + geracao_automatica
 * + conexão Bling status 'ok' + ciclo vencido (proximo_relatorio_liberado_em
 * <= agora OU null). Ordena por proximo_relatorio_liberado_em asc nulls first.
 *
 * G0 (backoff): exclui org cujo relatório MAIS RECENTE é 'failed' criado há
 * menos de BACKOFF_FALHA_DIAS — sem isso o cron re-tentava org quebrada TODO
 * dia (até 2 chamadas Opus/dia/org). Um 'done' (ou requeue que virou done)
 * mais novo reabilita na hora.
 *
 * (a guarda de `plano` não-nulo fica em `enqueueReport`, que já rejeita `sem_plano`.)
 */
export async function listOrgsElegiveisParaGeracao(
  agora: Date,
): Promise<{ id: string; name: string }[]> {
  const corteFalha = new Date(agora.getTime() - BACKOFF_FALHA_DIAS * 86_400_000);
  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .innerJoin(
      connections,
      and(eq(connections.org_id, organizations.id), eq(connections.provider, 'bling')),
    )
    .where(
      and(
        eq(organizations.status, 'active'),
        eq(organizations.geracao_automatica, true),
        eq(connections.status, 'ok'),
        or(
          isNull(organizations.proximo_relatorio_liberado_em),
          lte(organizations.proximo_relatorio_liberado_em, agora),
        ),
        // corteFalha vai como ISO string + cast explícito: dentro de um fragmento
        // sql`` cru o encoder de coluna do drizzle não roda, e o postgres-js não
        // serializa um Date solto (bind falha com "Received an instance of Date").
        sql`NOT EXISTS (
          SELECT 1 FROM reports ult
          WHERE ult.org_id = ${organizations.id}
            AND ult.status = 'failed'
            AND ult.created_at > ${corteFalha.toISOString()}::timestamptz
            AND ult.created_at = (
              SELECT MAX(r2.created_at) FROM reports r2 WHERE r2.org_id = ult.org_id
            )
        )`,
      ),
    )
    .orderBy(sql`${organizations.proximo_relatorio_liberado_em} asc nulls first`);
  return rows.filter((r) => r.name !== null);
}

/**
 * Orgs active com geração automática ligada cujos `minFalhas` relatórios mais
 * recentes são TODOS 'failed' (exige pelo menos `minFalhas` relatórios) —
 * candidatas a pausa da auto-geração. Window function evita N+1.
 */
export async function listOrgsComFalhasConsecutivas(
  minFalhas: number,
): Promise<{ id: string; name: string }[]> {
  const rows = await db.execute(sql`
    SELECT o.id, o.name
    FROM organizations o
    JOIN (
      SELECT org_id
      FROM (
        SELECT r.org_id, r.status,
               row_number() OVER (PARTITION BY r.org_id ORDER BY r.created_at DESC) AS rn
        FROM reports r
      ) ult
      WHERE ult.rn <= ${minFalhas}
      GROUP BY org_id
      HAVING count(*) = ${minFalhas}
         AND count(*) FILTER (WHERE status = 'failed') = ${minFalhas}
    ) f ON f.org_id = o.id
    WHERE o.status = 'active' AND o.geracao_automatica = true
  `);
  return (rows as unknown as { id: string; name: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
  }));
}
