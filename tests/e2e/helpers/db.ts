import { createCipheriv, randomBytes } from 'node:crypto';

import { eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  connections,
  loginAttempts,
  marketSnapshots,
  notifications,
  orders,
  organizations,
  reports,
  taskActivities,
  taskComments,
  taskTemplates,
  tasks,
  trackedProducts,
  users,
} from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';

/** Mirrors encryptSecret from @/modules/crypto/crypto — avoids importing serverEnv in the test helper. */
function encryptForTest(plaintext: string): string {
  const encKey = process.env.ENCRYPTION_KEY ?? '';
  const key = Buffer.from(encKey, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export const E2E_PREFIX = 'ta-test-e2e-';

function makeDb() {
  const sql = postgres(process.env.DATABASE_URL_TEST ?? '', { prepare: false });
  const tdb = drizzle(sql);
  return { sql, tdb };
}

export async function cleanupE2E(): Promise<void> {
  const { sql, tdb } = makeDb();
  try {
    const orgs = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(like(organizations.name, `${E2E_PREFIX}%`));
    for (const org of orgs) {
      // FK order (CRM tables, Task 14): notifications (→ users) → task_activities
      // & task_comments (→ tasks, users) → tasks (→ orgs, reports, users) —
      // all BEFORE the pre-existing chain below (tasks.report_id references
      // reports, so tasks must go before reports too).
      const orgUsers = await tdb.select({ id: users.id }).from(users).where(eq(users.org_id, org.id));
      const userIds = orgUsers.map((u) => u.id);
      if (userIds.length > 0) {
        await tdb.delete(notifications).where(inArray(notifications.user_id, userIds));
      }

      const orgTasks = await tdb.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, org.id));
      const taskIds = orgTasks.map((t) => t.id);
      if (taskIds.length > 0) {
        await tdb.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
        await tdb.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
      }
      await tdb.delete(tasks).where(eq(tasks.org_id, org.id));

      // FK order: market_snapshots (→ reports & orgs) → reports (→ orgs) → orders (→ orgs)
      // → trackedProducts, connections, users → organizations
      await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, org.id));
      await tdb.delete(reports).where(eq(reports.org_id, org.id));
      await tdb.delete(orders).where(eq(orders.org_id, org.id));
      await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, org.id));
      await tdb.delete(connections).where(eq(connections.org_id, org.id));
      await tdb.delete(users).where(eq(users.org_id, org.id));
      await tdb.delete(organizations).where(eq(organizations.id, org.id));
    }

    // Globalmente: templates semeados em algum teste (não pertencem a nenhuma org).
    await tdb.delete(taskTemplates).where(like(taskTemplates.titulo, `${E2E_PREFIX}%`));

    // Globalmente: tentativas de login/signup dos e-mails de teste (não têm FK
    // para org). Acumulam entre rodadas e o rate-limit de signup derruba os E2E.
    await tdb.delete(loginAttempts).where(like(loginAttempts.email, `${E2E_PREFIX}%`));
  } finally {
    await sql.end();
  }
}

export async function seedE2EAdmin(email: string, senha: string): Promise<void> {
  const { sql, tdb } = makeDb();
  try {
    const senha_hash = await hashPassword(senha);
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${E2E_PREFIX}truth-interno`, status: 'active' })
      .returning({ id: organizations.id });
    await tdb
      .insert(users)
      .values({ org_id: org!.id, email, senha_hash, role: 'admin_truth' });
  } finally {
    await sql.end();
  }
}

export async function seedE2EActiveClient(email: string, senha: string): Promise<string> {
  const { sql, tdb } = makeDb();
  try {
    const senha_hash = await hashPassword(senha);
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${E2E_PREFIX}cliente-ativo`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    await tdb
      .insert(users)
      .values({ org_id: org!.id, email, senha_hash, role: 'client' });
    return org!.id;
  } finally {
    await sql.end();
  }
}

/**
 * Inserts a report row into the test DB for the given org.
 * Returns the new report id.
 */
export async function seedReport(
  orgId: string,
  opts: {
    status?: 'queued' | 'running' | 'done' | 'failed';
    metricas?: unknown;
    analiseIa?: unknown;
    erro?: string;
  } = {},
): Promise<string> {
  const { sql, tdb } = makeDb();
  try {
    const [row] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        status: opts.status ?? 'done',
        metricas: (opts.metricas ?? null) as Record<string, unknown> | null,
        analise_ia: (opts.analiseIa ?? null) as Record<string, unknown> | null,
        erro: opts.erro ?? null,
      })
      .returning({ id: reports.id });
    return row!.id;
  } finally {
    await sql.end();
  }
}

/** Inserts a fake-but-valid Bling connection (status 'ok') directly into the test DB. */
export async function seedBlingConnection(orgId: string): Promise<void> {
  const { sql, tdb } = makeDb();
  try {
    const fakeAccessToken = encryptForTest('fake-access-token');
    const fakeRefreshToken = encryptForTest('fake-refresh-token');
    const expira_em = new Date(Date.now() + 3600 * 1000); // 1h from now
    await tdb
      .insert(connections)
      .values({
        org_id: orgId,
        provider: 'bling',
        access_token: fakeAccessToken,
        refresh_token: fakeRefreshToken,
        expira_em,
        status: 'ok',
      })
      .onConflictDoUpdate({
        target: [connections.org_id, connections.provider],
        set: {
          access_token: fakeAccessToken,
          refresh_token: fakeRefreshToken,
          expira_em,
          status: 'ok',
        },
      });
  } finally {
    await sql.end();
  }
}

/** Inserts a task row into the test DB for the given org. Returns the new task id. */
export async function seedTask(
  orgId: string,
  opts: {
    titulo: string;
    criadoPor?: 'analista' | 'cliente' | 'ia';
    status?: string;
    tipo?: string;
    prioridade?: string;
  },
): Promise<string> {
  const { sql, tdb } = makeDb();
  try {
    const [row] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: opts.titulo,
        criado_por: opts.criadoPor ?? 'analista',
        status: opts.status ?? 'backlog',
        tipo: opts.tipo ?? 'outro',
        prioridade: opts.prioridade ?? 'media',
      })
      .returning({ id: tasks.id });
    return row!.id;
  } finally {
    await sql.end();
  }
}
