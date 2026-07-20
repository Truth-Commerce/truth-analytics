import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  alerts,
  analystBriefings,
  auditLog,
  calendarSuggestions,
  connections,
  cycles,
  kitSuggestions,
  loginAttempts,
  marketSnapshots,
  notifications,
  orders,
  organizations,
  passwordResetTokens,
  reports,
  taskActivities,
  taskComments,
  taskWatchers,
  tasks,
  trackedProducts,
  users,
} from '@/db/schema';
import { purgeOrg } from '../../scripts/purge-org';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();
const NOME = `ta-test-purge-${RUN}`;

describe.skipIf(!url)('purgeOrg — integração (org sintética completa)', () => {
  let orgId = '';
  let userId = '';
  let internaId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: NOME, status: 'active', plano: 'monthly' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [user] = await tdb
      .insert(users)
      .values({ org_id: orgId, email: `purge-${RUN}@ta-test.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    userId = user.id;

    const [report] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: new Date('2026-07-01T00:00:00Z'),
        periodo_fim: new Date('2026-07-07T23:59:59Z'),
        status: 'done',
      })
      .returning({ id: reports.id });

    const [cycle] = await tdb
      .insert(cycles)
      .values({ org_id: orgId, nome: `${NOME}-ciclo` })
      .returning({ id: cycles.id });

    const [task] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${NOME}-task`,
        criado_por: 'ia',
        report_id: report.id,
        cycle_id: cycle.id,
      })
      .returning({ id: tasks.id });

    await tdb.insert(taskWatchers).values({ task_id: task.id, user_id: userId });
    await tdb.insert(taskComments).values({ task_id: task.id, user_id: userId, corpo: 'c' });
    await tdb.insert(taskActivities).values({ task_id: task.id, user_id: userId, evento: 'criada' });
    await tdb.insert(notifications).values({ user_id: userId, tipo: 'alerta', titulo: 't' });
    await tdb.insert(alerts).values({ org_id: orgId, tipo: 'queda_vendas', titulo: 't', corpo: 'c' });
    await tdb.insert(marketSnapshots).values({
      org_id: orgId,
      report_id: report.id,
      fonte: 'ml_publico',
      keyword: 'kw',
      dados: {},
    });
    await tdb.insert(kitSuggestions).values({
      org_id: orgId,
      report_id: report.id,
      titulo: `${NOME}-kit`,
      payload: {},
    });
    await tdb.insert(calendarSuggestions).values({
      org_id: orgId,
      report_id: report.id,
      titulo: `${NOME}-calendario`,
      payload: {},
    });
    await tdb.insert(analystBriefings).values({
      org_id: orgId,
      report_id: report.id,
      payload: {},
    });
    await tdb.insert(orders).values({
      org_id: orgId,
      bling_order_id: `${RUN}`,
      canal: 'Mercado Livre',
      data: new Date('2026-07-02T12:00:00Z'),
      valor_total: '100.00',
    });
    await tdb.insert(trackedProducts).values({ org_id: orgId, nome: 'Produto', keywords: [] });
    await tdb.insert(connections).values({ org_id: orgId, provider: 'bling', status: 'ok' });
    await tdb.insert(passwordResetTokens).values({
      user_id: userId,
      token_hash: 'f'.repeat(64),
      expira_em: new Date(Date.now() + 3_600_000),
    });
    await tdb.insert(loginAttempts).values({ email: `purge-${RUN}@ta-test.com`, success: true });
    await tdb.insert(auditLog).values({ org_id: orgId, user_id: userId, acao: 'org.criada' });

    // Org interna (guard org_interna)
    const [interna] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-purge-interna-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internaId = interna.id;
    await tdb.insert(users).values({
      org_id: internaId,
      email: `purge-admin-${RUN}@ta-test.com`,
      senha_hash: 'h',
      role: 'admin_truth',
    });
  });

  afterAll(async () => {
    try {
      // A org principal deve ter sido purgada pelo teste; limpar a interna e resíduos.
      await tdb.delete(users).where(eq(users.org_id, internaId));
      await tdb.delete(organizations).where(eq(organizations.id, internaId));
      await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
      await tdb.delete(loginAttempts).where(eq(loginAttempts.email, `purge-${RUN}@ta-test.com`));
    } finally {
      await sql.end();
    }
  });

  it('nome de confirmação errado → confirmacao_invalida (nada excluído)', async () => {
    await expect(
      purgeOrg(tdb, { orgId, nomeConfirmacao: 'Nome Errado', confirm: true }),
    ).rejects.toThrow('confirmacao_invalida');
  });

  it('org com usuário admin_truth → org_interna (proteção absoluta)', async () => {
    await expect(
      purgeOrg(tdb, {
        orgId: internaId,
        nomeConfirmacao: `ta-test-purge-interna-${RUN}`,
        confirm: true,
      }),
    ).rejects.toThrow('org_interna');
  });

  it('dry-run (default) conta tudo e NÃO exclui nada', async () => {
    const res = await purgeOrg(tdb, { orgId, nomeConfirmacao: NOME, confirm: false });
    expect(res.executado).toBe(false);
    expect(res.contagens).toMatchObject({
      notifications: 1,
      task_watchers: 1,
      task_comments: 1,
      task_activities: 1,
      tasks: 1,
      cycles: 1,
      kit_suggestions: 1,
      calendar_suggestions: 1,
      analyst_briefings: 1,
      alerts: 1,
      market_snapshots: 1,
      reports: 1,
      orders: 1,
      tracked_products: 1,
      connections: 1,
      password_reset_tokens: 1,
      login_attempts: 1,
      audit_log: 1,
      users: 1,
      organizations: 1,
    });
    const [org] = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org).toBeTruthy();
  });

  it('com --confirm exclui tudo na ordem de FK e registra org.purgada', async () => {
    const res = await purgeOrg(tdb, { orgId, nomeConfirmacao: NOME, confirm: true });
    expect(res.executado).toBe(true);

    const [org] = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org).toBeUndefined();
    const restoUsers = await tdb.select({ id: users.id }).from(users).where(eq(users.org_id, orgId));
    expect(restoUsers.length).toBe(0);
    const restoOrders = await tdb.select({ id: orders.id }).from(orders).where(eq(orders.org_id, orgId));
    expect(restoOrders.length).toBe(0);
    const restoCycles = await tdb.select({ id: cycles.id }).from(cycles).where(eq(cycles.org_id, orgId));
    expect(restoCycles.length).toBe(0);
    const restoWatchers = await tdb
      .select({ id: taskWatchers.id })
      .from(taskWatchers)
      .where(eq(taskWatchers.user_id, userId));
    expect(restoWatchers.length).toBe(0);

    const trilha = await tdb
      .select({ acao: auditLog.acao })
      .from(auditLog)
      .where(eq(auditLog.org_id, orgId));
    expect(trilha.map((t) => t.acao)).toEqual(['org.purgada']);
  });

  it('org inexistente → org_nao_encontrada', async () => {
    await expect(
      purgeOrg(tdb, {
        orgId: '00000000-0000-0000-0000-000000000000',
        nomeConfirmacao: 'x',
        confirm: false,
      }),
    ).rejects.toThrow('org_nao_encontrada');
  });
});
