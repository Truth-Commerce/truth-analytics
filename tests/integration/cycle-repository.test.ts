import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { cycles, organizations, reports, tasks } from '@/db/schema';
import type { Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-cycle-';

describe.skipIf(!url)('cycle.repository — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  const orgIds: string[] = [];

  let orgAId = '';
  let orgBId = '';

  beforeAll(async () => {
    const [orgA] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}A-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;
    orgIds.push(orgAId);

    const [orgB] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}B-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;
    orgIds.push(orgBId);
  });

  afterAll(async () => {
    if (orgIds.length) {
      await tdb.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await tdb.delete(reports).where(inArray(reports.org_id, orgIds));
      await tdb.delete(cycles).where(inArray(cycles.org_id, orgIds));
      await tdb.delete(organizations).where(inArray(organizations.id, orgIds));
    }
    await sql.end();
  });

  it('criarCiclo cria com status planejado (default da tabela) na org correta', async () => {
    const { criarCiclo, listCiclos } = await import('@/modules/tasks/cycle.repository');
    const id = await criarCiclo(orgAId, { nome: 'Sprint 1', inicio: '2026-07-01', fim: '2026-07-14' });
    expect(id).toBeTruthy();

    const [row] = await tdb.select().from(cycles).where(eq(cycles.id, id));
    expect(row?.status).toBe('planejado');
    expect(row?.org_id).toBe(orgAId);
    expect(row?.inicio).toBe('2026-07-01');
    expect(row?.fim).toBe('2026-07-14');

    const lista = await listCiclos(orgAId);
    expect(lista.some((c) => c.id === id)).toBe(true);
  });

  it('listCiclos só devolve ciclos da própria org (isolamento)', async () => {
    const { criarCiclo, listCiclos } = await import('@/modules/tasks/cycle.repository');
    const idA = await criarCiclo(orgAId, { nome: 'Sprint isolamento A' });
    const idB = await criarCiclo(orgBId, { nome: 'Sprint isolamento B' });

    const listaA = await listCiclos(orgAId);
    expect(listaA.map((c) => c.id)).toContain(idA);
    expect(listaA.map((c) => c.id)).not.toContain(idB);
  });

  it('getCicloAtivo devolve null sem ciclo ativo, e o ciclo quando status=ativo', async () => {
    const { criarCiclo, getCicloAtivo } = await import('@/modules/tasks/cycle.repository');
    const [orgIsolada] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}ativo-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const orgIsoladaId = orgIsolada!.id;
    orgIds.push(orgIsoladaId);

    expect(await getCicloAtivo(orgIsoladaId)).toBeNull();

    const cicloId = await criarCiclo(orgIsoladaId, { nome: 'Sprint ativa' });
    await tdb.update(cycles).set({ status: 'ativo' }).where(eq(cycles.id, cicloId));

    const ativo = await getCicloAtivo(orgIsoladaId);
    expect(ativo?.id).toBe(cicloId);
    expect(ativo?.status).toBe('ativo');
  });

  it('moverTaskParaCiclo move a task quando task E ciclo pertencem à mesma org', async () => {
    const { criarCiclo, moverTaskParaCiclo, tasksDoCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, { nome: 'Sprint mover' });
    const [task] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'Task pra mover', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 1,
      })
      .returning({ id: tasks.id });
    const taskId = task!.id;

    await moverTaskParaCiclo(taskId, orgAId, cicloId);

    const [row] = await tdb.select().from(tasks).where(eq(tasks.id, taskId));
    expect(row?.cycle_id).toBe(cicloId);

    const doCiclo = await tasksDoCiclo(orgAId, cicloId);
    expect(doCiclo.map((t) => t.id)).toEqual([taskId]);
  });

  it('moverTaskParaCiclo com cycleId=null remove a task do ciclo', async () => {
    const { criarCiclo, moverTaskParaCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, { nome: 'Sprint remover' });
    const [task] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'Task pra remover do ciclo', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 2, cycle_id: cicloId,
      })
      .returning({ id: tasks.id });
    const taskId = task!.id;

    await moverTaskParaCiclo(taskId, orgAId, null);

    const [row] = await tdb.select().from(tasks).where(eq(tasks.id, taskId));
    expect(row?.cycle_id).toBeNull();
  });

  it('moverTaskParaCiclo rejeita quando a TASK é de outra org (mesmo o ciclo sendo válido)', async () => {
    const { criarCiclo, moverTaskParaCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, { nome: 'Sprint task-alheia' });
    const [taskDeB] = await tdb
      .insert(tasks)
      .values({
        org_id: orgBId, titulo: 'Task da org B', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 1,
      })
      .returning({ id: tasks.id });

    await expect(moverTaskParaCiclo(taskDeB!.id, orgAId, cicloId)).rejects.toThrow();

    const [row] = await tdb.select().from(tasks).where(eq(tasks.id, taskDeB!.id));
    expect(row?.cycle_id).toBeNull(); // não mudou
  });

  it('moverTaskParaCiclo rejeita quando o CICLO é de outra org (mesmo a task sendo válida)', async () => {
    const { criarCiclo, moverTaskParaCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloDeB = await criarCiclo(orgBId, { nome: 'Sprint ciclo-alheio' });
    const [taskDeA] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'Task da org A', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 3,
      })
      .returning({ id: tasks.id });

    await expect(moverTaskParaCiclo(taskDeA!.id, orgAId, cicloDeB)).rejects.toThrow();

    const [row] = await tdb.select().from(tasks).where(eq(tasks.id, taskDeA!.id));
    expect(row?.cycle_id).toBeNull(); // não mudou
  });

  it('fecharCiclo muda status para fechado; ciclo de outra org lança (não fecha o de outrem)', async () => {
    const { criarCiclo, fecharCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, { nome: 'Sprint fechar' });

    await fecharCiclo(orgAId, cicloId);
    const [row] = await tdb.select().from(cycles).where(eq(cycles.id, cicloId));
    expect(row?.status).toBe('fechado');

    await expect(fecharCiclo(orgBId, cicloId)).rejects.toThrow();
  });

  it('tasksDoCiclo devolve só as tasks do ciclo E da org (isolamento duplo)', async () => {
    const { criarCiclo, moverTaskParaCiclo, tasksDoCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloAlvo = await criarCiclo(orgAId, { nome: 'Sprint alvo' });
    const outroCiclo = await criarCiclo(orgAId, { nome: 'Sprint outro' });

    const [taskNoAlvo] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'No ciclo alvo', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 4,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskNoAlvo!.id, orgAId, cicloAlvo);

    const [taskNoOutro] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'No outro ciclo', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 5,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskNoOutro!.id, orgAId, outroCiclo);

    const doAlvo = await tasksDoCiclo(orgAId, cicloAlvo);
    expect(doAlvo.map((t) => t.id)).toEqual([taskNoAlvo!.id]);

    // org errada não enxerga, mesmo passando o cycleId certo.
    expect(await tasksDoCiclo(orgBId, cicloAlvo)).toEqual([]);
  });

  it('retrospectivaDoCiclo soma planejadas/concluidas/impactoBRL (motor F2) das tasks do ciclo', async () => {
    const { criarCiclo, moverTaskParaCiclo, retrospectivaDoCiclo } = await import('@/modules/tasks/cycle.repository');

    function metricas(total: number): Metricas {
      return {
        vendasPorCanal: [{ canal: 'shopee', total, pedidos: 1 }],
        evolucao: [], ticketMedio: 100, topProdutos: [], posicaoPreco: [], benchmarkParcial: false,
      };
    }

    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}retro-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const orgId = org!.id;
    orgIds.push(orgId);

    const [origem] = await tdb
      .insert(reports)
      .values({
        org_id: orgId, periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-06-30'),
        status: 'done', metricas: metricas(1000),
      })
      .returning({ id: reports.id });
    await tdb.update(reports).set({ created_at: new Date('2026-06-01T00:00:00.000Z') }).where(eq(reports.id, origem!.id));

    const [atual] = await tdb
      .insert(reports)
      .values({
        org_id: orgId, periodo_inicio: new Date('2026-07-01'), periodo_fim: new Date('2026-07-15'),
        status: 'done', metricas: metricas(1500),
      })
      .returning({ id: reports.id });
    await tdb.update(reports).set({ created_at: new Date('2026-07-01T00:00:00.000Z') }).where(eq(reports.id, atual!.id));

    const cicloId = await criarCiclo(orgId, { nome: 'Sprint retrospectiva' });

    // task concluída COM impacto calculável (origem=1000, há posterior done=1500 -> +500).
    const [taskComImpacto] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId, titulo: 'Com impacto', tipo: 'outro', prioridade: 'media', status: 'concluida',
        criado_por: 'analista', report_id: origem!.id, ordem: 1,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskComImpacto!.id, orgId, cicloId);

    // task concluída SEM impacto calculável (sem report_id, criada agora -> baseline vira o
    // próprio done mais recente, sem posterior -> null -> não soma nada).
    const [taskSemImpacto] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId, titulo: 'Sem impacto', tipo: 'outro', prioridade: 'media', status: 'concluida',
        criado_por: 'analista', ordem: 2,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskSemImpacto!.id, orgId, cicloId);

    // task ainda aberta: conta em planejadas, não em concluidas nem no impacto.
    const [taskAberta] = await tdb
      .insert(tasks)
      .values({
        org_id: orgId, titulo: 'Aberta', tipo: 'outro', prioridade: 'media', status: 'todo',
        criado_por: 'analista', ordem: 3,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskAberta!.id, orgId, cicloId);

    const retro = await retrospectivaDoCiclo(orgId, cicloId);
    expect(retro.planejadas).toBe(3);
    expect(retro.concluidas).toBe(2);
    expect(retro.taxaConclusao).toBe(67); // round(2/3*100)
    expect(retro.impactoBRL).toBe(500); // só a task com impacto calculável: 1500-1000
  });
});
