/**
 * I/O da inteligência comparativa da carteira (H4 T7) — a contraparte não
 * pura de `comparativo.ts`: cada função aqui só BUSCA/ESCREVE dado (nenhuma
 * regra de agrupamento/ranking mora aqui); a decisão de negócio (agregar por
 * canal, filtrar impacto positivo) é sempre delegada às funções puras de
 * `comparativo.ts`.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { tasks } from '@/db/schema';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess, getCarteira } from '@/modules/analista/analista.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import type { UserAccess } from '@/modules/auth/user.types';
import { MetricasSchema } from '@/modules/pipeline/contracts';
import { getLatestDoneReport } from '@/modules/reports/report.repository';
import { getTaskImpact } from '@/modules/tasks/task-impact';
import { createTask, listTasksByOrg } from '@/modules/tasks/task.repository';
import type { TaskPrioridade, TaskTipo } from '@/modules/tasks/task.types';

import { sugestoesReplicaveis, type TaskReplicavel } from './comparativo';

// ---------------------------------------------------------------------------
// Ranking de canais — leitura crua (a agregação/ranking é `rankearCanaisCarteira`)
// ---------------------------------------------------------------------------

/**
 * `vendasPorCanal` do ÚLTIMO relatório `done` de cada org da carteira
 * (escopo por papel via `getCarteira`), concatenados numa lista crua — quem
 * agrega/rankeia por canal é a função pura `rankearCanaisCarteira`
 * (comparativo.ts). Org sem nenhum `done` ainda simplesmente não contribui
 * nenhuma entrada (não é erro).
 */
export async function getVendasPorCanalCarteira(
  access: UserAccess,
): Promise<Array<{ canal: string; total: number }>> {
  const carteira = await getCarteira(access);
  const porOrg = await Promise.all(
    carteira.map(async (org) => {
      const rep = await getLatestDoneReport(org.orgId);
      if (!rep) return [];
      const parsed = MetricasSchema.safeParse(rep.metricas);
      if (!parsed.success) return [];
      return parsed.data.vendasPorCanal.map((c) => ({ canal: c.canal, total: c.total }));
    }),
  );
  return porOrg.flat();
}

// ---------------------------------------------------------------------------
// "O que funcionou" — candidatos replicáveis (a decisão de filtrar/ordenar é `sugestoesReplicaveis`)
// ---------------------------------------------------------------------------

/** Quantas tasks concluídas recentes de CADA org tentam calcular impacto — mesmo limite de `getVisao360`. */
const TASKS_REPLICAVEIS_LIMITE_POR_ORG = 10;

/**
 * Tasks `concluida` da carteira inteira (escopo por papel) com impacto
 * POSITIVO medido pelo motor de impacto (F2 — `getTaskImpact`), prontas para
 * sugerir réplica em outra org. Cruza todas as orgs da carteira; dentro de
 * cada org, só as concluídas mais recentes entram na varredura (mesmo
 * critério de `getVisao360`, para carteiras com muitas concluídas não pagar
 * um custo ilimitado de comparações).
 */
export async function getTasksReplicaveisCarteira(access: UserAccess): Promise<TaskReplicavel[]> {
  const carteira = await getCarteira(access);
  const porOrg = await Promise.all(
    carteira.map(async (org) => {
      const todasTasks = await listTasksByOrg(org.orgId);
      const concluidas = todasTasks
        .filter((t) => t.status === 'concluida')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, TASKS_REPLICAVEIS_LIMITE_POR_ORG);
      const impactos = await Promise.all(concluidas.map((t) => getTaskImpact(t.id, org.orgId)));
      const candidatos: TaskReplicavel[] = [];
      concluidas.forEach((t, i) => {
        const impacto = impactos[i];
        if (impacto === null) return;
        candidatos.push({
          taskId: t.id,
          orgId: org.orgId,
          orgName: org.orgName,
          titulo: t.titulo,
          tipo: t.tipo,
          deltaPct: impacto.deltaPct,
        });
      });
      return candidatos;
    }),
  );
  return sugestoesReplicaveis(porOrg.flat());
}

// ---------------------------------------------------------------------------
// Replicar task para outra org da carteira
// ---------------------------------------------------------------------------

export type ReplicarTaskResult = { ok: true; taskId: string } | { ok: false; erro: string };

/**
 * Cria, na org de DESTINO, uma cópia pré-preenchida (titulo/descricao/tipo/
 * prioridade) da task de ORIGEM — com uma nota "_Replicada de [org
 * origem]._" anexada à descrição. NUNCA copia comentários (createTask nunca
 * toca `task_comments`; a réplica sempre nasce sem nenhum).
 *
 * Escopo dos DOIS lados via `assertOrgAccess`: a org da task de origem E a
 * org de destino precisam estar na carteira do `access` (analista: só a
 * própria; admin: qualquer org cliente) — replicar não pode ser uma porta
 * lateral para ler/escrever fora do escopo do papel.
 *
 * `taskOrigemId` é buscado SEM filtro de org (para descobrir a org antes de
 * validar o acesso) — se não existir, devolve `task_nao_encontrada` antes de
 * qualquer checagem de escopo (nada a vazar sobre orgs de terceiros).
 */
export async function replicarTask(
  access: UserAccess,
  taskOrigemId: string,
  orgDestinoId: string,
): Promise<ReplicarTaskResult> {
  const [origem] = await db.select().from(tasks).where(eq(tasks.id, taskOrigemId)).limit(1);
  if (!origem) return { ok: false, erro: 'task_nao_encontrada' };

  try {
    await assertOrgAccess(access, origem.org_id); // lado ORIGEM
    await assertOrgAccess(access, orgDestinoId); // lado DESTINO
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') return { ok: false, erro: 'acesso_negado' };
    throw e;
  }

  const orgOrigem = await getOrganizationById(origem.org_id);
  const nota = `_Replicada de ${orgOrigem?.name ?? 'outra organização'}._`;
  const descricao = origem.descricao ? `${origem.descricao}\n\n${nota}` : nota;

  const taskId = await createTask({
    orgId: orgDestinoId,
    titulo: origem.titulo,
    descricao,
    tipo: origem.tipo as TaskTipo,
    prioridade: origem.prioridade as TaskPrioridade,
    criadoPor: 'analista',
    actorUserId: access.id,
  });

  await recordAudit({
    orgId: orgDestinoId,
    userId: access.id,
    acao: 'task.replicada',
    detalhes: { taskOrigemId, orgOrigemId: origem.org_id, taskDestinoId: taskId },
  });

  return { ok: true, taskId };
}
