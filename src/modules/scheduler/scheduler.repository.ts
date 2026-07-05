import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';

/**
 * Orgs elegíveis para geração automática: active + plano + geracao_automatica
 * + conexão Bling status 'ok' + ciclo vencido (proximo_relatorio_liberado_em <= agora OU null).
 * Ordena por proximo_relatorio_liberado_em asc (nulls first) — mais atrasadas primeiro.
 *
 * (a guarda de `plano` não-nulo fica em `enqueueReport`, que já rejeita `sem_plano`.)
 */
export async function listOrgsElegiveisParaGeracao(
  agora: Date,
): Promise<{ id: string; name: string }[]> {
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
      ),
    )
    .orderBy(sql`${organizations.proximo_relatorio_liberado_em} asc nulls first`);
  return rows.filter((r) => r.name !== null);
}
