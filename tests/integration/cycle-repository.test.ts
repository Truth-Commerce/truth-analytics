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

  // ---------------------------------------------------------------------
  // F4 (revisão H5/T11) tentou resolver "tasks de ciclo fechado ficam
  // presas pra sempre" limpando `cycle_id` das não-concluídas em
  // `fecharCiclo` — mas isso quebrava a retrospectiva: `planejadas` E
  // `concluidas` vêm de `tasksDoCiclo` (filtra por `cycle_id`), então depois
  // de fechar só as CONCLUÍDAS continuavam vinculadas e todo ciclo fechado
  // reportava 100% de taxa de conclusão, sempre — mesmo um sprint que
  // entregou 3 de 10. F1 (re-review) reverteu a limpeza de `cycle_id` em
  // `fecharCiclo` e moveu a solução do problema original pra `tasksSemCiclo`
  // (que agora também devolve tasks de ciclos FECHADOS).
  // ---------------------------------------------------------------------
  it('fecharCiclo NÃO mexe em cycle_id (histórico intacto) — retrospectiva de um ciclo parcialmente entregue reporta a taxa verdadeira, não 100%', async () => {
    const { criarCiclo, fecharCiclo, moverTaskParaCiclo, tasksSemCiclo, retrospectivaDoCiclo } = await import(
      '@/modules/tasks/cycle.repository'
    );
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}fechar-libera-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const orgIsoladaId = org!.id;
    orgIds.push(orgIsoladaId);

    const cicloId = await criarCiclo(orgIsoladaId, { nome: 'Sprint pra fechar com tasks' });

    const [taskAberta] = await tdb
      .insert(tasks)
      .values({
        org_id: orgIsoladaId, titulo: 'Aberta no ciclo fechado', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 1,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskAberta!.id, orgIsoladaId, cicloId);

    const [taskConcluida] = await tdb
      .insert(tasks)
      .values({
        org_id: orgIsoladaId, titulo: 'Concluída no ciclo fechado', tipo: 'outro', prioridade: 'media',
        status: 'concluida', criado_por: 'analista', ordem: 2,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskConcluida!.id, orgIsoladaId, cicloId);

    await fecharCiclo(orgIsoladaId, cicloId);

    // cycle_id de NENHUMA das duas tasks é tocado — histórico do ciclo intacto.
    const [rowAberta] = await tdb.select().from(tasks).where(eq(tasks.id, taskAberta!.id));
    expect(rowAberta?.cycle_id).toBe(cicloId);

    const [rowConcluida] = await tdb.select().from(tasks).where(eq(tasks.id, taskConcluida!.id));
    expect(rowConcluida?.cycle_id).toBe(cicloId);

    // Mesmo sem cycle_id=null, a aberta reaparece no pool — via LEFT JOIN
    // cycles + `status='fechado'` em tasksSemCiclo, não via cycle_id IS NULL.
    const pool = await tasksSemCiclo(orgIsoladaId);
    expect(pool.map((t) => t.id)).toContain(taskAberta!.id);

    // A retrospectiva conta as DUAS tasks do ciclo (planejadas=2), só 1
    // concluída — taxa real de 50%, não 100%.
    const retro = await retrospectivaDoCiclo(orgIsoladaId, cicloId);
    expect(retro.planejadas).toBe(2);
    expect(retro.concluidas).toBe(1);
    expect(retro.taxaConclusao).toBe(50);
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

  // ---------------------------------------------------------------------
  // ativarCiclo (H5/T9) — única transição planejado -> ativo; guarda org E
  // status de origem (só a partir de 'planejado').
  // ---------------------------------------------------------------------
  it('ativarCiclo muda planejado -> ativo, org-scoped', async () => {
    const { criarCiclo, ativarCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, { nome: 'Sprint ativar' });

    await ativarCiclo(orgAId, cicloId);

    const [row] = await tdb.select().from(cycles).where(eq(cycles.id, cicloId));
    expect(row?.status).toBe('ativo');
  });

  it('ativarCiclo rejeita ciclo de outra org (não ativa o de outrem)', async () => {
    const { criarCiclo, ativarCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloDeB = await criarCiclo(orgBId, { nome: 'Sprint ativar B' });

    await expect(ativarCiclo(orgAId, cicloDeB)).rejects.toThrow('ciclo_nao_encontrado');

    const [row] = await tdb.select().from(cycles).where(eq(cycles.id, cicloDeB));
    expect(row?.status).toBe('planejado'); // intacto
  });

  it('ativarCiclo rejeita a partir de status != planejado (não reabre fechado, não re-ativa ativo)', async () => {
    const { criarCiclo, ativarCiclo, fecharCiclo } = await import('@/modules/tasks/cycle.repository');

    const cicloJaAtivo = await criarCiclo(orgAId, { nome: 'Sprint já ativa' });
    await ativarCiclo(orgAId, cicloJaAtivo);
    await expect(ativarCiclo(orgAId, cicloJaAtivo)).rejects.toThrow('transicao_invalida');

    const cicloFechado = await criarCiclo(orgAId, { nome: 'Sprint fechada' });
    await fecharCiclo(orgAId, cicloFechado);
    await expect(ativarCiclo(orgAId, cicloFechado)).rejects.toThrow('transicao_invalida');
  });

  // ---------------------------------------------------------------------
  // F5 (revisão H5/T11) — ativarCiclo não demovia o ciclo 'ativo' anterior;
  // duas orgs podiam acabar com dois ciclos 'ativo' simultâneos. F5
  // demovia via `fecharCiclo`, mas fechar é IRREVERSÍVEL por contrato do
  // produto (a UI só fecha atrás de confirmação explícita) — clicar
  // "Ativar" fechava o ciclo anterior SEM aviso nenhum. F2 (re-review)
  // trocou a demoção pra 'planejado' (reversível) e envolveu ativar+demover
  // na MESMA transação.
  // ---------------------------------------------------------------------
  it('ativarCiclo demove qualquer OUTRO ciclo ativo da org pra "planejado" (reversível — NÃO fecha), só um ativo por vez', async () => {
    const { criarCiclo, ativarCiclo, getCicloAtivo } = await import('@/modules/tasks/cycle.repository');
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}unico-ativo-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const orgUnicoAtivoId = org!.id;
    orgIds.push(orgUnicoAtivoId);

    const cicloA = await criarCiclo(orgUnicoAtivoId, { nome: 'Sprint A' });
    const cicloB = await criarCiclo(orgUnicoAtivoId, { nome: 'Sprint B' });

    await ativarCiclo(orgUnicoAtivoId, cicloA);
    await ativarCiclo(orgUnicoAtivoId, cicloB);

    const [rowA] = await tdb.select().from(cycles).where(eq(cycles.id, cicloA));
    const [rowB] = await tdb.select().from(cycles).where(eq(cycles.id, cicloB));
    expect(rowA?.status).toBe('planejado'); // demovido (reversível), NÃO fechado
    expect(rowB?.status).toBe('ativo');

    const ativo = await getCicloAtivo(orgUnicoAtivoId);
    expect(ativo?.id).toBe(cicloB); // só um ativo — o mais recente

    // Reversível de verdade: A (demovido a 'planejado') pode ser reativado —
    // o que, por sua vez, demove B de volta a 'planejado'.
    await ativarCiclo(orgUnicoAtivoId, cicloA);
    const [rowA2] = await tdb.select().from(cycles).where(eq(cycles.id, cicloA));
    const [rowB2] = await tdb.select().from(cycles).where(eq(cycles.id, cicloB));
    expect(rowA2?.status).toBe('ativo');
    expect(rowB2?.status).toBe('planejado');
  });

  it('duas ativações concorrentes do MESMO ciclo: só uma vence (UPDATE condicional fecha a corrida — H5/T10)', async () => {
    const { criarCiclo, ativarCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, { nome: 'Sprint corrida' });

    // Antes do fix, ativarCiclo fazia SELECT (checa status) seguido de um UPDATE
    // incondicional — as duas chamadas concorrentes passavam pelo SELECT vendo
    // 'planejado' e as duas UPDATE'avam sem erro. Com `eq(cycles.status,
    // 'planejado')` no WHERE do UPDATE, o Postgres serializa via lock de linha:
    // a segunda chamada só enxerga a linha DEPOIS do commit da primeira, já com
    // status='ativo' — 0 linhas afetadas -> 'transicao_invalida'. Só uma ativação
    // é aceita como "quem ativou" (no-op auditável na segunda).
    // Pré-aquece o pool (max>1 fora de serverless) para as DUAS chamadas concorrentes
    // usarem conexões físicas JÁ estabelecidas — sem isso, o handshake TLS da 2ª
    // conexão sozinho pode ultrapassar o round-trip inteiro da 1ª chamada,
    // mascarando a corrida (falso-negativo por sorte de latência, não pelo fix).
    const { db } = await import('@/db/client');
    const { sql: rawSql } = await import('drizzle-orm');
    await Promise.all([1, 2, 3, 4].map(() => db.execute(rawSql`select 1`)));

    const resultados = await Promise.allSettled([ativarCiclo(orgAId, cicloId), ativarCiclo(orgAId, cicloId)]);
    const sucesso = resultados.filter((r) => r.status === 'fulfilled');
    const falha = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(sucesso).toHaveLength(1);
    expect(falha).toHaveLength(1);
    expect((falha[0].reason as Error).message).toBe('transicao_invalida');

    const [row] = await tdb.select().from(cycles).where(eq(cycles.id, cicloId));
    expect(row?.status).toBe('ativo'); // estado final continua correto (uma ativação venceu)
  });

  // ---------------------------------------------------------------------
  // tasksSemCiclo (H5/T9) — pool de tasks candidatas a entrar num ciclo.
  // ---------------------------------------------------------------------
  it('tasksSemCiclo devolve só tasks da org SEM cycle_id (exclui as já num ciclo)', async () => {
    const { criarCiclo, moverTaskParaCiclo, tasksSemCiclo } = await import('@/modules/tasks/cycle.repository');

    const [orgIsolada] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}sem-ciclo-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const orgIsoladaId = orgIsolada!.id;
    orgIds.push(orgIsoladaId);

    const cicloId = await criarCiclo(orgIsoladaId, { nome: 'Sprint pool' });

    const [taskForaDoCiclo] = await tdb
      .insert(tasks)
      .values({
        org_id: orgIsoladaId, titulo: 'Fora do ciclo', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 1,
      })
      .returning({ id: tasks.id });

    const [taskNoCiclo] = await tdb
      .insert(tasks)
      .values({
        org_id: orgIsoladaId, titulo: 'No ciclo', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 2,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskNoCiclo!.id, orgIsoladaId, cicloId);

    const pool = await tasksSemCiclo(orgIsoladaId);
    expect(pool.map((t) => t.id)).toEqual([taskForaDoCiclo!.id]);
  });

  // ---------------------------------------------------------------------
  // burndownDoCiclo (H5/T9) — delega para burndown() puro com status +
  // updated_at das tasks do ciclo.
  // ---------------------------------------------------------------------
  it('burndownDoCiclo devolve [] quando o ciclo não tem inicio/fim definidos', async () => {
    const { criarCiclo, burndownDoCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, { nome: 'Sprint sem datas' });

    expect(await burndownDoCiclo(orgAId, cicloId)).toEqual([]);
  });

  it('burndownDoCiclo devolve [] quando o ciclo é de outra org', async () => {
    const { criarCiclo, burndownDoCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloDeB = await criarCiclo(orgBId, { nome: 'Sprint burndown B', inicio: '2026-07-01', fim: '2026-07-02' });

    expect(await burndownDoCiclo(orgAId, cicloDeB)).toEqual([]);
  });

  it('burndownDoCiclo soma as tasks do ciclo e delega a série pro burndown() puro', async () => {
    const { criarCiclo, moverTaskParaCiclo, burndownDoCiclo } = await import('@/modules/tasks/cycle.repository');
    const cicloId = await criarCiclo(orgAId, {
      nome: 'Sprint burndown A', inicio: '2026-07-01', fim: '2026-07-02',
    });

    const [taskAberta] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'Aberta bd', tipo: 'outro', prioridade: 'media',
        status: 'todo', criado_por: 'analista', ordem: 20,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskAberta!.id, orgAId, cicloId);

    // fechou bem ANTES do ciclo começar -> não conta em nenhum dia do intervalo.
    const [taskFechadaAntes] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'Fechada antes bd', tipo: 'outro', prioridade: 'media',
        status: 'concluida', criado_por: 'analista', ordem: 21,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskFechadaAntes!.id, orgAId, cicloId);
    await tdb
      .update(tasks)
      .set({ updated_at: new Date('2026-06-01T12:00:00.000Z') })
      .where(eq(tasks.id, taskFechadaAntes!.id));

    // fechou bem DEPOIS do ciclo acabar -> conta como aberta nos DOIS dias.
    const [taskFechadaDepois] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId, titulo: 'Fechada depois bd', tipo: 'outro', prioridade: 'media',
        status: 'concluida', criado_por: 'analista', ordem: 22,
      })
      .returning({ id: tasks.id });
    await moverTaskParaCiclo(taskFechadaDepois!.id, orgAId, cicloId);
    await tdb
      .update(tasks)
      .set({ updated_at: new Date('2026-07-10T12:00:00.000Z') })
      .where(eq(tasks.id, taskFechadaDepois!.id));

    const pontos = await burndownDoCiclo(orgAId, cicloId);
    expect(pontos).toEqual([
      { dia: '2026-07-01', abertas: 2 }, // aberta + fechada-depois (fechada-antes já não conta)
      { dia: '2026-07-02', abertas: 2 },
    ]);
  });
});
