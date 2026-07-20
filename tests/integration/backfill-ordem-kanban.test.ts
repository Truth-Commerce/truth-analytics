import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, tasks } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-backfill-ordem-';

describe.skipIf(!url)('backfill de ordem (migration 0017) — integração', () => {
  const sqlClient = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sqlClient);

  const orgIds: string[] = [];

  afterAll(async () => {
    if (orgIds.length) {
      await tdb.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await tdb.delete(organizations).where(inArray(organizations.id, orgIds));
    }
    await sqlClient.end();
  });

  /**
   * F3 (re-review): `ordenarColuna` (kanban-order.ts) passou a ordenar por
   * `ordem` PRIMEIRO — necessário pro drag/reorder ser real, mas isso só
   * reproduz a ordem visual de HOJE (prioridade alta->media->baixa, prazo
   * asc) se `ordem`, pra cada coluna nunca arrastada, já estiver na ordem de
   * prioridade. A migration 0017 faz esse backfill via ROW_NUMBER() OVER
   * (PARTITION BY org_id, status ORDER BY <ordenação antiga>).
   *
   * Este teste reproduz a MESMA lógica de ORDER BY da migration (deve ficar
   * em sincronia com `src/db/migrations/0017_backfill_ordem_kanban.sql` —
   * qualquer mudança lá deve ser espelhada aqui), só acrescentando um filtro
   * `WHERE org_id = $1` na seleção interna — a migration real roda uma vez,
   * sem esse filtro, sobre a tabela inteira; o filtro aqui existe só pra não
   * mexer em tasks de outras orgs/testes rodando em paralelo contra o mesmo
   * banco de teste compartilhado.
   */
  it('após o backfill, uma coluna nunca arrastada sai em ordem de prioridade (alta -> media -> baixa; prazo asc como desempate)', async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const orgId = org!.id;
    orgIds.push(orgId);

    // Simula uma coluna "nunca arrastada": ordem = ordem de CHEGADA
    // (crescente, atribuída como MAX(ordem)+1 por createTask/moveTask),
    // deliberadamente fora de ordem de prioridade/prazo.
    const [baixa] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId, titulo: 'Baixa chegou primeiro', tipo: 'outro', prioridade: 'baixa',
        status: 'todo', criado_por: 'analista', ordem: 1,
      })
      .returning({ id: tasks.id });
    const [altaPrazoTarde] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId, titulo: 'Alta prazo tarde', tipo: 'outro', prioridade: 'alta', prazo: '2026-08-10',
        status: 'todo', criado_por: 'analista', ordem: 2,
      })
      .returning({ id: tasks.id });
    const [altaPrazoCedo] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId, titulo: 'Alta prazo cedo', tipo: 'outro', prioridade: 'alta', prazo: '2026-08-01',
        status: 'todo', criado_por: 'analista', ordem: 3,
      })
      .returning({ id: tasks.id });
    const [media] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId, titulo: 'Media chegou por ultimo', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 4,
      })
      .returning({ id: tasks.id });

    // Pré-condição: antes do backfill, a ordem (de chegada) NÃO bate com a
    // ordem de prioridade — é exatamente esse o cenário que o backfill corrige.
    const antes = await tdb
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.org_id, orgId))
      .orderBy(tasks.ordem);
    expect(antes.map((t) => t.id)).toEqual([baixa!.id, altaPrazoTarde!.id, altaPrazoCedo!.id, media!.id]);

    await tdb.execute(sql`
      UPDATE "tasks" t
      SET "ordem" = sub.nova_ordem::integer
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY org_id, status
            ORDER BY
              CASE prioridade
                WHEN 'alta' THEN 0
                WHEN 'media' THEN 1
                WHEN 'baixa' THEN 2
                ELSE 3
              END ASC,
              prazo ASC NULLS LAST,
              ordem ASC,
              created_at ASC
          ) AS nova_ordem
        FROM "tasks"
        WHERE org_id = ${orgId}
      ) sub
      WHERE t.id = sub.id
    `);

    const depois = await tdb
      .select({ id: tasks.id, ordem: tasks.ordem })
      .from(tasks)
      .where(eq(tasks.org_id, orgId))
      .orderBy(tasks.ordem);

    expect(depois.map((t) => t.id)).toEqual([altaPrazoCedo!.id, altaPrazoTarde!.id, media!.id, baixa!.id]);
    // Sequencial 1..N por (org_id, status), igual ao que `proximaOrdem` produziria do zero.
    expect(depois.map((t) => t.ordem)).toEqual([1, 2, 3, 4]);
  });
});
