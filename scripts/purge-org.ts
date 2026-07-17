import { fileURLToPath } from 'node:url';

import { and, count, eq, inArray, ne } from 'drizzle-orm';

import type { DatabaseClient } from '@/db/client';
import {
  alerts,
  auditLog,
  connections,
  kitSuggestions,
  loginAttempts,
  marketSnapshots,
  notifications,
  orders,
  organizations,
  passwordResetTokens,
  productStock,
  reports,
  taskActivities,
  taskComments,
  tasks,
  trackedProducts,
  users,
} from '@/db/schema';

export type PurgeResultado = { executado: boolean; contagens: Record<string, number> };

/**
 * Exclusão TOTAL e IRREVERSÍVEL dos dados de uma organização (LGPD — direito
 * de eliminação). Regras de segurança:
 *  - confirmação dupla: orgId + nome EXATO da org (confirmacao_invalida);
 *  - org com usuário admin_truth NUNCA é purgada (org_interna);
 *  - dry-run por default (confirm=false → só conta, nada é excluído);
 *  - deletes em UMA transação, na ordem de FK (filhos → pais);
 *  - ao final grava 1 linha `org.purgada` no audit_log (sem FK — sobrevive à org).
 */
export async function purgeOrg(
  dbc: DatabaseClient,
  input: { orgId: string; nomeConfirmacao: string; confirm: boolean },
): Promise<PurgeResultado> {
  const [org] = await dbc
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) throw new Error('org_nao_encontrada');
  if (org.name !== input.nomeConfirmacao) throw new Error('confirmacao_invalida');

  const usuarios = await dbc
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.org_id, input.orgId));
  if (usuarios.some((u) => u.role === 'admin_truth')) throw new Error('org_interna');

  const userIds = usuarios.map((u) => u.id);
  const emails = usuarios.map((u) => u.email);
  const taskRows = await dbc
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.org_id, input.orgId));
  const taskIds = taskRows.map((t) => t.id);

  const n = async (q: Promise<Array<{ n: number }>>) => Number((await q)[0]?.n ?? 0);
  const contagens: Record<string, number> = {
    notifications:
      userIds.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(notifications).where(inArray(notifications.user_id, userIds))),
    task_comments:
      taskIds.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(taskComments).where(inArray(taskComments.task_id, taskIds))),
    task_activities:
      taskIds.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(taskActivities).where(inArray(taskActivities.task_id, taskIds))),
    tasks: taskIds.length,
    kit_suggestions: await n(
      dbc.select({ n: count() }).from(kitSuggestions).where(eq(kitSuggestions.org_id, input.orgId)),
    ),
    alerts: await n(dbc.select({ n: count() }).from(alerts).where(eq(alerts.org_id, input.orgId))),
    market_snapshots: await n(
      dbc.select({ n: count() }).from(marketSnapshots).where(eq(marketSnapshots.org_id, input.orgId)),
    ),
    reports: await n(dbc.select({ n: count() }).from(reports).where(eq(reports.org_id, input.orgId))),
    orders: await n(dbc.select({ n: count() }).from(orders).where(eq(orders.org_id, input.orgId))),
    tracked_products: await n(
      dbc.select({ n: count() }).from(trackedProducts).where(eq(trackedProducts.org_id, input.orgId)),
    ),
    product_stock: await n(
      dbc.select({ n: count() }).from(productStock).where(eq(productStock.org_id, input.orgId)),
    ),
    connections: await n(
      dbc.select({ n: count() }).from(connections).where(eq(connections.org_id, input.orgId)),
    ),
    password_reset_tokens:
      userIds.length === 0
        ? 0
        : await n(
            dbc
              .select({ n: count() })
              .from(passwordResetTokens)
              .where(inArray(passwordResetTokens.user_id, userIds)),
          ),
    login_attempts:
      emails.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(loginAttempts).where(inArray(loginAttempts.email, emails))),
    audit_log: await n(dbc.select({ n: count() }).from(auditLog).where(eq(auditLog.org_id, input.orgId))),
    users: userIds.length,
    organizations: 1,
  };

  if (!input.confirm) return { executado: false, contagens };

  await dbc.transaction(async (tx) => {
    // Filhos de users/tasks primeiro
    if (userIds.length > 0) {
      await tx.delete(notifications).where(inArray(notifications.user_id, userIds));
    }
    if (taskIds.length > 0) {
      await tx.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
      await tx.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
    }
    // Tabelas escopadas por org (kit_suggestions antes de tasks/reports por
    // kit_suggestions.report_id e kit_suggestions.task_id; tasks antes de
    // reports por tasks.report_id; market_snapshots antes de reports por
    // market_snapshots.report_id)
    await tx.delete(kitSuggestions).where(eq(kitSuggestions.org_id, input.orgId));
    await tx.delete(tasks).where(eq(tasks.org_id, input.orgId));
    await tx.delete(alerts).where(eq(alerts.org_id, input.orgId));
    await tx.delete(marketSnapshots).where(eq(marketSnapshots.org_id, input.orgId));
    await tx.delete(reports).where(eq(reports.org_id, input.orgId));
    await tx.delete(orders).where(eq(orders.org_id, input.orgId));
    await tx.delete(trackedProducts).where(eq(trackedProducts.org_id, input.orgId));
    await tx.delete(productStock).where(eq(productStock.org_id, input.orgId));
    await tx.delete(connections).where(eq(connections.org_id, input.orgId));
    if (userIds.length > 0) {
      await tx.delete(passwordResetTokens).where(inArray(passwordResetTokens.user_id, userIds));
      // Referências cruzadas defensivas (não deveriam existir p/ org cliente,
      // mas quebrariam o DELETE de users por FK):
      await tx
        .update(organizations)
        .set({ analista_id: null })
        .where(inArray(organizations.analista_id, userIds));
      await tx
        .update(tasks)
        .set({ assignee_user_id: null })
        .where(and(inArray(tasks.assignee_user_id, userIds), ne(tasks.org_id, input.orgId)));
      await tx
        .update(taskActivities)
        .set({ user_id: null })
        .where(inArray(taskActivities.user_id, userIds));
    }
    if (emails.length > 0) {
      await tx.delete(loginAttempts).where(inArray(loginAttempts.email, emails));
    }
    // LGPD: trilha antiga da org sai; a linha final `org.purgada` (abaixo) fica.
    await tx.delete(auditLog).where(eq(auditLog.org_id, input.orgId));
    await tx.delete(users).where(eq(users.org_id, input.orgId));
    await tx.delete(organizations).where(eq(organizations.id, input.orgId));

    await tx.insert(auditLog).values({
      org_id: input.orgId,
      user_id: null,
      acao: 'org.purgada',
      detalhes: { nome: org.name, tabelas: contagens },
    });
  });

  return { executado: true, contagens };
}

// ---------------------------------------------------------------------------
// CLI: npm run db:purge-org -- --org <uuid> --nome "Nome Exato" [--confirm]
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { orgId?: string; nome?: string; confirm: boolean } {
  const out: { orgId?: string; nome?: string; confirm: boolean } = { confirm: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--org') out.orgId = argv[++i];
    else if (argv[i] === '--nome') out.nome = argv[++i];
    else if (argv[i] === '--confirm') out.confirm = true;
  }
  return out;
}

async function main() {
  const { orgId, nome, confirm } = parseArgs(process.argv.slice(2));
  if (!orgId || !nome) {
    console.error('Uso: npm run db:purge-org -- --org <uuid> --nome "Nome Exato da Org" [--confirm]');
    console.error('Sem --confirm o script roda em DRY-RUN (só conta, nada é excluído).');
    process.exit(1);
  }
  const { db } = await import('@/db/client');
  try {
    const resultado = await purgeOrg(db, { orgId, nomeConfirmacao: nome, confirm });
    console.log(
      resultado.executado
        ? `EXCLUÍDO — org ${orgId} purgada. Linhas removidas por tabela:`
        : 'DRY-RUN (nada excluído — repita com --confirm para executar):',
    );
    for (const [tabela, qtd] of Object.entries(resultado.contagens)) {
      console.log(`  ${tabela}: ${qtd}`);
    }
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'org_nao_encontrada') console.error('Org não encontrada. Confira o UUID.');
    else if (msg === 'confirmacao_invalida')
      console.error('O nome informado NÃO confere com o nome da org. Nada foi excluído.');
    else if (msg === 'org_interna')
      console.error('Org interna (tem usuário admin_truth) — purge BLOQUEADO.');
    else console.error(`Falha no purge: ${msg}`);
    process.exit(1);
  }
}

// Executa main() apenas quando rodado como script (não em import de teste).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
