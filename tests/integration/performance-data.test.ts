import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, tasks, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import type { Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-perfdata-';

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

describe.skipIf(!url)('performance-data.repository — integração (I/O de H4 T8)', () => {
  const agora = new Date();
  const desde30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  let orgComAnalistaId = '';
  let orgSemAnalistaId = '';
  let analistaId = '';
  let taskRecenteId = '';
  let taskAntigaId = '';
  let taskOrgSemAnalistaId = '';

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');

    const [orgComAnalista] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}com-analista-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgComAnalistaId = orgComAnalista!.id;

    const [orgSemAnalista] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}sem-analista-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgSemAnalistaId = orgSemAnalista!.id;

    const [an] = await db
      .insert(users)
      .values({ org_id: orgComAnalistaId, email: `${PREFIX}an-${RUN}@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = an!.id;

    await db.update(organizations).set({ analista_id: analistaId }).where(eq(organizations.id, orgComAnalistaId));
    // orgSemAnalista fica com analista_id null (default) — deliberadamente sem atribuição.

    // --- reports done (origem → atual) na org COM analista: shopee 1000 → 1500 (deltaPct 50%) ---
    const [reportOrigem] = await db
      .insert(reports)
      .values({
        org_id: orgComAnalistaId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        status: 'done',
        metricas: metricasCanais([{ canal: 'shopee', total: 1000 }]),
      })
      .returning({ id: reports.id });
    await db.update(reports).set({ created_at: new Date('2026-06-01T00:00:00Z') }).where(eq(reports.id, reportOrigem!.id));

    const [reportAtual] = await db
      .insert(reports)
      .values({
        org_id: orgComAnalistaId,
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        status: 'done',
        metricas: metricasCanais([{ canal: 'shopee', total: 1500 }]),
      })
      .returning({ id: reports.id });
    await db.update(reports).set({ created_at: new Date('2026-07-01T00:00:00Z') }).where(eq(reports.id, reportAtual!.id));

    // --- task RECENTE (concluída DENTRO da janela de 30d, com impacto medível) ---
    const [tRecente] = await db
      .insert(tasks)
      .values({
        org_id: orgComAnalistaId,
        titulo: `${PREFIX}recente`,
        tipo: 'catalogo',
        prioridade: 'alta',
        status: 'concluida',
        criado_por: 'analista',
        report_id: reportOrigem!.id,
      })
      .returning({ id: tasks.id });
    taskRecenteId = tRecente!.id;
    await db.insert(taskActivities).values({
      task_id: taskRecenteId,
      user_id: analistaId,
      evento: 'status',
      de: 'em_andamento',
      para: 'concluida',
      created_at: new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 dias atrás
    });

    // --- task ANTIGA (concluída FORA da janela de 30d — não deve contar) ---
    const [tAntiga] = await db
      .insert(tasks)
      .values({
        org_id: orgComAnalistaId,
        titulo: `${PREFIX}antiga`,
        tipo: 'outro',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
      })
      .returning({ id: tasks.id });
    taskAntigaId = tAntiga!.id;
    await db.insert(taskActivities).values({
      task_id: taskAntigaId,
      user_id: analistaId,
      evento: 'status',
      de: 'em_andamento',
      para: 'concluida',
      created_at: new Date(agora.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 dias atrás — fora da janela
    });

    // --- task concluída na org SEM analista (dentro da janela) — nunca deve aparecer nos agregados ---
    const [tOrgSemAnalista] = await db
      .insert(tasks)
      .values({
        org_id: orgSemAnalistaId,
        titulo: `${PREFIX}sem-analista`,
        tipo: 'outro',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
      })
      .returning({ id: tasks.id });
    taskOrgSemAnalistaId = tOrgSemAnalista!.id;
    await db.insert(taskActivities).values({
      task_id: taskOrgSemAnalistaId,
      evento: 'status',
      de: 'em_andamento',
      para: 'concluida',
      created_at: new Date(agora.getTime() - 1 * 24 * 60 * 60 * 1000),
    });
  });

  afterAll(async () => {
    const taskIds = [taskRecenteId, taskAntigaId, taskOrgSemAnalistaId].filter(Boolean);
    if (taskIds.length) await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
    const orgIds = [orgComAnalistaId, orgSemAnalistaId].filter(Boolean);
    if (orgIds.length) {
      await db.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await db.delete(reports).where(inArray(reports.org_id, orgIds));
    }
    await db.update(organizations).set({ analista_id: null }).where(like(organizations.name, `${PREFIX}%`));
    if (analistaId) await db.delete(users).where(eq(users.id, analistaId));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('getAnalistaPorOrg: só orgs COM analista atribuído entram no map', async () => {
    const { getAnalistaPorOrg } = await import('@/modules/admin/performance-data.repository');
    const map = await getAnalistaPorOrg([orgComAnalistaId, orgSemAnalistaId]);
    expect(map.get(orgComAnalistaId)).toBe(analistaId);
    expect(map.has(orgSemAnalistaId)).toBe(false);
  });

  it('getAnalistaPorOrg: lista vazia de orgIds → map vazio, sem query', async () => {
    const { getAnalistaPorOrg } = await import('@/modules/admin/performance-data.repository');
    expect(await getAnalistaPorOrg([])).toEqual(new Map());
  });

  it('getTasksConcluidas30dPorAnalista: conta só a transição DENTRO da janela; org sem analista não conta em ninguém', async () => {
    const { getTasksConcluidas30dPorAnalista } = await import('@/modules/admin/performance-data.repository');
    const map = await getTasksConcluidas30dPorAnalista(desde30d);
    expect(map.get(analistaId)).toBe(1); // só a recente; a antiga (60d) fica de fora
  });

  it('getImpactosPorAnalista: mede deltaPct (motor F2) da task recente; a antiga (fora da janela) nem entra na varredura', async () => {
    const { getImpactosPorAnalista } = await import('@/modules/admin/performance-data.repository');
    const impactos = await getImpactosPorAnalista(desde30d);
    const daRecente = impactos.find((i) => i.analistaId === analistaId);
    expect(daRecente).toBeDefined();
    expect(daRecente!.deltaPct).toBe(50); // (1500-1000)/1000*100
    expect(impactos).toHaveLength(1); // só a recente — a antiga e a da org sem analista não entram
  });
});
