import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, orders, reports, taskActivities, taskComments, tasks, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';
import { getTaskById } from '@/modules/tasks/task.repository';
import type { Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-replicar-';

const asAccess = (id: string, role: UserAccess['role']): UserAccess =>
  ({ id, orgId: 'x', role, orgStatus: 'active', plano: null }) as UserAccess;

function metricasCanais(canais: Array<{ canal: string; total: number }>): Metricas {
  return {
    vendasPorCanal: canais.map((c) => ({ ...c, pedidos: 1 })),
    evolucao: [{ data: '2026-07-01', total: canais.reduce((s, c) => s + c.total, 0) }],
    ticketMedio: 100,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
  };
}

describe.skipIf(!url)('replicarTask — integração (escopo dos dois lados + réplica)', () => {
  let orgOrigemId = '';
  let orgDestinoId = '';
  let orgForaId = '';
  let analistaId = '';
  let adminId = '';
  let taskOrigemId = '';
  let taskEmOrgForaId = '';
  let reportOrigemId = '';

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');

    const [orgOrigem] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}origem-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgOrigemId = orgOrigem!.id;

    const [orgDestino] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}destino-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgDestinoId = orgDestino!.id;

    const [orgFora] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}fora-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgForaId = orgFora!.id;

    const [an] = await db
      .insert(users)
      .values({ org_id: orgOrigemId, email: `${PREFIX}an-${RUN}@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = an!.id;

    const [admin] = await db
      .insert(users)
      .values({ org_id: orgOrigemId, email: `${PREFIX}admin-${RUN}@example.com`, senha_hash, role: 'admin_truth' })
      .returning({ id: users.id });
    adminId = admin!.id;

    // Carteira do analista = orgOrigem + orgDestino; orgFora fica sem analista.
    await db
      .update(organizations)
      .set({ analista_id: analistaId })
      .where(inArray(organizations.id, [orgOrigemId, orgDestinoId]));

    const [taskOrigem] = await db
      .insert(tasks)
      .values({
        org_id: orgOrigemId,
        titulo: `${PREFIX}task origem`,
        descricao: 'Descrição original da task de origem.',
        tipo: 'catalogo',
        prioridade: 'alta',
        status: 'concluida',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskOrigemId = taskOrigem!.id;
    // Comentário na origem — NÃO deve ser copiado para a réplica.
    await db.insert(taskComments).values({ task_id: taskOrigemId, user_id: analistaId, corpo: 'Comentário privado da origem.' });

    const [taskEmOrgFora] = await db
      .insert(tasks)
      .values({
        org_id: orgForaId,
        titulo: `${PREFIX}task fora`,
        tipo: 'outro',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskEmOrgForaId = taskEmOrgFora!.id;

    // --- reports para getVendasPorCanalCarteira + getTasksReplicaveisCarteira ---
    // orgOrigem: 2 done (origem → atual), shopee sobe 1000 → 1500 + entra mercado livre 200.
    // taskOrigem vira "concluída com impacto positivo" (report_id = origem).
    const [reportOrigem] = await db
      .insert(reports)
      .values({
        org_id: orgOrigemId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        status: 'done',
        metricas: metricasCanais([{ canal: 'shopee', total: 1000 }]),
      })
      .returning({ id: reports.id });
    reportOrigemId = reportOrigem!.id;
    await db.update(reports).set({ created_at: new Date('2026-06-01T00:00:00Z') }).where(eq(reports.id, reportOrigemId));
    await db.update(tasks).set({ report_id: reportOrigemId }).where(eq(tasks.id, taskOrigemId));

    const [reportAtual] = await db
      .insert(reports)
      .values({
        org_id: orgOrigemId,
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        status: 'done',
        metricas: metricasCanais([
          { canal: 'shopee', total: 1500 },
          { canal: 'mercado livre', total: 200 },
        ]),
      })
      .returning({ id: reports.id });
    await db.update(reports).set({ created_at: new Date('2026-07-01T00:00:00Z') }).where(eq(reports.id, reportAtual!.id));

    // orgDestino: 1 done, mercado livre 300.
    await db.insert(reports).values({
      org_id: orgDestinoId,
      periodo_inicio: new Date('2026-07-01'),
      periodo_fim: new Date('2026-07-08'),
      status: 'done',
      metricas: metricasCanais([{ canal: 'mercado livre', total: 300 }]),
    });

    // orgFora: 1 done com total bem maior — NÃO deve entrar no ranking da carteira do analista.
    await db.insert(reports).values({
      org_id: orgForaId,
      periodo_inicio: new Date('2026-07-01'),
      periodo_fim: new Date('2026-07-08'),
      status: 'done',
      metricas: metricasCanais([{ canal: 'shopee', total: 9999 }]),
    });
  });

  afterAll(async () => {
    const orgIds = [orgOrigemId, orgDestinoId, orgForaId].filter(Boolean);
    if (orgIds.length) {
      const taskRows = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, orgIds));
      const taskIds = taskRows.map((r) => r.id);
      // createTask grava em task_activities (FK → tasks) — limpar antes de apagar as tasks.
      if (taskIds.length) {
        await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
        await db.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
      }
      await db.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await db.delete(orders).where(inArray(orders.org_id, orgIds));
      await db.delete(reports).where(inArray(reports.org_id, orgIds));
      await db.delete(auditLog).where(inArray(auditLog.org_id, orgIds));
    }
    // organizations.analista_id → users.id (sem ON DELETE): limpar antes do delete de users.
    await db.update(organizations).set({ analista_id: null }).where(like(organizations.name, `${PREFIX}%`));
    const userIds = [analistaId, adminId].filter(Boolean);
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('task de origem FORA da carteira do analista → erro, nenhuma task criada no destino', async () => {
    const { replicarTask } = await import('@/modules/analista/comparativo-data.repository');
    const antes = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgDestinoId));

    const r = await replicarTask(asAccess(analistaId, 'analista'), taskEmOrgForaId, orgDestinoId);

    expect(r).toEqual({ ok: false, erro: 'acesso_negado' });
    const depois = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgDestinoId));
    expect(depois).toHaveLength(antes.length);
  });

  it('org DESTINO fora da carteira do analista → erro, nenhuma task criada', async () => {
    const { replicarTask } = await import('@/modules/analista/comparativo-data.repository');
    const antes = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgForaId));

    const r = await replicarTask(asAccess(analistaId, 'analista'), taskOrigemId, orgForaId);

    expect(r).toEqual({ ok: false, erro: 'acesso_negado' });
    const depois = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgForaId));
    expect(depois).toHaveLength(antes.length);
  });

  it('task de origem inexistente → erro task_nao_encontrada', async () => {
    const { replicarTask } = await import('@/modules/analista/comparativo-data.repository');
    const r = await replicarTask(asAccess(analistaId, 'analista'), '00000000-0000-0000-0000-000000000000', orgDestinoId);
    expect(r).toEqual({ ok: false, erro: 'task_nao_encontrada' });
  });

  it('happy path (dois lados na carteira): cria task pré-preenchida com nota de origem, SEM comentários, com audit', async () => {
    const { replicarTask } = await import('@/modules/analista/comparativo-data.repository');

    const r = await replicarTask(asAccess(analistaId, 'analista'), taskOrigemId, orgDestinoId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const nova = await getTaskById(r.taskId, orgDestinoId);
    expect(nova).not.toBeNull();
    expect(nova!.titulo).toBe(`${PREFIX}task origem`);
    expect(nova!.tipo).toBe('catalogo');
    expect(nova!.prioridade).toBe('alta');
    expect(nova!.descricao).toContain('Descrição original da task de origem.');
    expect(nova!.descricao).toContain(`Replicada de ${PREFIX}origem-${RUN}`);
    expect(nova!.criadoPor).toBe('analista');

    // SEM copiar comentários — a réplica nasce sem nenhum.
    const comentarios = await db.select().from(taskComments).where(eq(taskComments.task_id, r.taskId));
    expect(comentarios).toHaveLength(0);

    // Audit gravado no destino.
    const auditRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.acao, 'task.replicada'));
    const auditDaReplica = auditRows.find((a) => a.org_id === orgDestinoId);
    expect(auditDaReplica).toBeDefined();
    expect(auditDaReplica!.detalhes).toMatchObject({ taskOrigemId, orgOrigemId, taskDestinoId: r.taskId } as Record<
      string,
      unknown
    >);
  });

  it('admin pode replicar entre quaisquer orgs (sem restrição de carteira)', async () => {
    const { replicarTask } = await import('@/modules/analista/comparativo-data.repository');
    const r = await replicarTask(asAccess(adminId, 'admin_truth'), taskOrigemId, orgForaId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nova = await getTaskById(r.taskId, orgForaId);
    expect(nova).not.toBeNull();
  });

  it('getVendasPorCanalCarteira: agrega o último done de cada org da carteira (orgFora não entra)', async () => {
    const { getVendasPorCanalCarteira } = await import('@/modules/analista/comparativo-data.repository');
    const { rankearCanaisCarteira } = await import('@/modules/analista/comparativo');

    const entradas = await getVendasPorCanalCarteira(asAccess(analistaId, 'analista'));
    const ranking = rankearCanaisCarteira(entradas);

    // orgOrigem (último done): shopee 1500 + mercado livre 200; orgDestino: mercado livre 300.
    expect(ranking).toEqual([
      { canal: 'shopee', total: 1500, participacaoPct: 75 },
      { canal: 'mercado livre', total: 500, participacaoPct: 25 },
    ]);
    // O total de orgFora (9999) não pode ter vazado para dentro do ranking.
    expect(ranking.every((r) => r.total < 9999)).toBe(true);
  });

  it('getTasksReplicaveisCarteira: task concluída da carteira com impacto positivo aparece pronta pra replicar', async () => {
    const { getTasksReplicaveisCarteira } = await import('@/modules/analista/comparativo-data.repository');

    const sugestoes = await getTasksReplicaveisCarteira(asAccess(analistaId, 'analista'));
    const daOrigem = sugestoes.find((s) => s.taskId === taskOrigemId);

    expect(daOrigem).toBeDefined();
    expect(daOrigem!.orgId).toBe(orgOrigemId);
    expect(daOrigem!.titulo).toBe(`${PREFIX}task origem`);
    expect(daOrigem!.tipo).toBe('catalogo');
    expect(daOrigem!.deltaPct).toBe(70); // (1700 - 1000) / 1000 * 100

    // A task concluída de orgFora nunca aparece (fora do escopo do papel).
    expect(sugestoes.some((s) => s.taskId === taskEmOrgForaId)).toBe(false);
  });
});
