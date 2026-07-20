import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { notifications, organizations, taskActivities, taskWatchers, tasks, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-watchmenc-';

describe.skipIf(!url)('watcher.repository + setTaskLabels + notificarMencoes/notificarWatchers — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  let orgAId = '';
  let orgBId = '';
  let analistaId = ''; // autor típico dos comentários/status (não deve se autonotificar)
  let clienteId = ''; // será mencionado como @cliente
  let financeiroId = ''; // será mencionado como @financeiro
  let userBId = ''; // usuário de outra org (nunca deve ser notificado/observar cross-org)
  let taskAId = '';
  let taskBId = '';

  beforeAll(async () => {
    const [orgA] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}A-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;

    const [orgB] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}B-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;

    const [analista] = await tdb
      .insert(users)
      .values({ org_id: orgAId, email: `${PREFIX}analista-${RUN}@example.com`, senha_hash: 'hash', role: 'analista' })
      .returning({ id: users.id });
    analistaId = analista!.id;

    // Local-part limpo de propósito ("cliente"/"Financeiro") — é exatamente o
    // handle que os testes de menção usam (@cliente / @financeiro); a
    // unicidade do e-mail entre execuções vem do domínio, que carrega RUN.
    const [cliente] = await tdb
      .insert(users)
      .values({ org_id: orgAId, email: `cliente@${PREFIX}${RUN}.example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    clienteId = cliente!.id;

    const [financeiro] = await tdb
      .insert(users)
      .values({
        org_id: orgAId,
        email: `Financeiro@${PREFIX}${RUN}.example.com`,
        senha_hash: 'hash',
        role: 'client',
      })
      .returning({ id: users.id });
    financeiroId = financeiro!.id;

    const [userB] = await tdb
      .insert(users)
      .values({ org_id: orgBId, email: `${PREFIX}b-${RUN}@example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userBId = userB!.id;

    const [taskA] = await tdb
      .insert(tasks)
      .values({
        org_id: orgAId,
        titulo: 'Tarefa A (watchers/menções)',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'backlog',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskAId = taskA!.id;

    const [taskB] = await tdb
      .insert(tasks)
      .values({
        org_id: orgBId,
        titulo: 'Tarefa B (outra org)',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'backlog',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskBId = taskB!.id;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId].filter(Boolean);
    if (orgIds.length) {
      const taskRows = await tdb.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, orgIds));
      const taskIds = taskRows.map((r) => r.id);
      if (taskIds.length) {
        await tdb.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
        await tdb.delete(taskWatchers).where(inArray(taskWatchers.task_id, taskIds));
      }
      const userRows = await tdb.select({ id: users.id }).from(users).where(inArray(users.org_id, orgIds));
      const userIds = userRows.map((r) => r.id);
      if (userIds.length) await tdb.delete(notifications).where(inArray(notifications.user_id, userIds));
      await tdb.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await tdb.delete(users).where(inArray(users.org_id, orgIds));
      await tdb.delete(organizations).where(inArray(organizations.id, orgIds));
    }
    await sql.end();
  });

  // ---------------------------------------------------------------------
  // watcher.repository
  // ---------------------------------------------------------------------

  it('addWatcher adiciona; listWatchers devolve o watcher com email+role', async () => {
    const { addWatcher, listWatchers } = await import('@/modules/tasks/watcher.repository');

    await addWatcher(taskAId, orgAId, clienteId);

    const watchers = await listWatchers(taskAId, orgAId);
    expect(watchers).toHaveLength(1);
    expect(watchers[0]!.userId).toBe(clienteId);
    expect(watchers[0]!.email).toBe(`cliente@${PREFIX}${RUN}.example.com`);
    expect(watchers[0]!.role).toBe('client');
  });

  it('addWatcher é idempotente: observar de novo não duplica nem lança', async () => {
    const { addWatcher, listWatchers } = await import('@/modules/tasks/watcher.repository');

    await expect(addWatcher(taskAId, orgAId, clienteId)).resolves.toBeUndefined();

    const watchers = await listWatchers(taskAId, orgAId);
    expect(watchers).toHaveLength(1);
  });

  it('addWatcher com orgId de B sobre task de A rejeita task_nao_encontrada', async () => {
    const { addWatcher } = await import('@/modules/tasks/watcher.repository');

    await expect(addWatcher(taskAId, orgBId, userBId)).rejects.toThrow('task_nao_encontrada');
  });

  it('listWatchers com orgId de B sobre task de A devolve [] (escopo via join)', async () => {
    const { listWatchers } = await import('@/modules/tasks/watcher.repository');

    expect(await listWatchers(taskAId, orgBId)).toEqual([]);
  });

  it('removeWatcher com orgId de B sobre task de A rejeita task_nao_encontrada (task de A intacta)', async () => {
    const { removeWatcher, listWatchers } = await import('@/modules/tasks/watcher.repository');

    await expect(removeWatcher(taskAId, orgBId, clienteId)).rejects.toThrow('task_nao_encontrada');
    expect(await listWatchers(taskAId, orgAId)).toHaveLength(1);
  });

  it('addWatcher(analista) + removeWatcher(cliente): listWatchers reflete só o analista', async () => {
    const { addWatcher, removeWatcher, listWatchers } = await import('@/modules/tasks/watcher.repository');

    await addWatcher(taskAId, orgAId, analistaId);
    await removeWatcher(taskAId, orgAId, clienteId);

    const watchers = await listWatchers(taskAId, orgAId);
    expect(watchers.map((w) => w.userId)).toEqual([analistaId]);
  });

  // ---------------------------------------------------------------------
  // setTaskLabels (task.repository)
  // ---------------------------------------------------------------------

  it('setTaskLabels normaliza (trim/dedup/cap/max) antes de persistir, e getTaskById reflete', async () => {
    const { setTaskLabels, getTaskById } = await import('@/modules/tasks/task.repository');

    const gravadas = await setTaskLabels(taskAId, orgAId, ['  Promo  ', 'promo', 'PROMO', 'a'.repeat(30)]);
    expect(gravadas).toEqual(['Promo', 'a'.repeat(20)]);

    const detalhe = await getTaskById(taskAId, orgAId);
    expect(detalhe?.labels).toEqual(['Promo', 'a'.repeat(20)]);
  });

  it('setTaskLabels com orgId de B sobre task de A rejeita task_nao_encontrada', async () => {
    const { setTaskLabels } = await import('@/modules/tasks/task.repository');

    await expect(setTaskLabels(taskAId, orgBId, ['x'])).rejects.toThrow('task_nao_encontrada');
  });

  it('listLabelsUsadas(orgA) devolve as labels da taskA (já normalizadas) e nunca as de orgB', async () => {
    const { listLabelsUsadas } = await import('@/modules/tasks/task.repository');
    const { sugerirLabels } = await import('@/modules/tasks/labels');

    const usadas = await listLabelsUsadas(orgAId);
    expect(usadas).toEqual([['Promo', 'a'.repeat(20)]]);
    expect(sugerirLabels(usadas)).toEqual(['Promo', 'a'.repeat(20)]);

    expect(await listLabelsUsadas(orgBId)).toEqual([[]]); // taskB sem labels — array vazio, não ausência de linha
  });

  // ---------------------------------------------------------------------
  // notificarMencoes
  // ---------------------------------------------------------------------

  it('notificarMencoes resolve @handle contra o e-mail dos usuários da org (case-insensitive) e notifica cada um, exceto o autor', async () => {
    const { notificarMencoes } = await import('@/modules/tasks/task-notifications');
    const { countUnread, listNotifications } = await import('@/modules/notifications/notification.repository');

    // handle "financeiro" vem de "Financeiro@..." (case-insensitive); autor é o analista.
    await notificarMencoes(
      orgAId,
      'Oi @financeiro, pode confirmar? cc @cliente',
      analistaId,
      taskAId,
      'Tarefa A (watchers/menções)',
    );

    expect(await countUnread(financeiroId)).toBe(1);
    expect(await countUnread(clienteId)).toBe(1);
    expect(await countUnread(analistaId)).toBe(0); // autor nunca se autonotifica

    const notifsFinanceiro = await listNotifications(financeiroId);
    const item = notifsFinanceiro.find((n) => n.tipo === 'task_mencao');
    expect(item).toBeDefined();
    expect(item!.corpo).toBe('Tarefa A (watchers/menções)');
    expect(item!.href).toBe(`/dashboard/plano-de-acao/${taskAId}`); // cliente → href do lado cliente
  });

  it('notificarMencoes: autor mencionando o próprio handle não se autonotifica', async () => {
    const { notificarMencoes } = await import('@/modules/tasks/task-notifications');
    const { countUnread } = await import('@/modules/notifications/notification.repository');

    const antesAnalista = await countUnread(analistaId);
    await notificarMencoes(orgAId, 'Só eu mesmo aqui, sem handle de terceiros', analistaId, taskAId, 'Tarefa A');
    expect(await countUnread(analistaId)).toBe(antesAnalista);
  });

  it('notificarMencoes: texto sem menções não notifica ninguém e não lança', async () => {
    const { notificarMencoes } = await import('@/modules/tasks/task-notifications');

    await expect(
      notificarMencoes(orgAId, 'nada de handle por aqui', analistaId, taskAId, 'Tarefa A'),
    ).resolves.toBeUndefined();
  });

  it('notificarMencoes com orgId inexistente não lança (best-effort)', async () => {
    const { notificarMencoes } = await import('@/modules/tasks/task-notifications');

    await expect(
      notificarMencoes('00000000-0000-0000-0000-000000000000', '@financeiro', analistaId, taskAId, 'Tarefa A'),
    ).resolves.toBeUndefined();
  });

  // ---------------------------------------------------------------------
  // notificarWatchers
  // ---------------------------------------------------------------------

  it('notificarWatchers notifica os watchers da task, exceto o autor', async () => {
    const { addWatcher } = await import('@/modules/tasks/watcher.repository');
    const { notificarWatchers } = await import('@/modules/tasks/task-notifications');
    const { countUnread, listNotifications } = await import('@/modules/notifications/notification.repository');

    // watchers atuais: analista (da etapa anterior). Adiciona também o cliente como watcher.
    await addWatcher(taskAId, orgAId, clienteId);

    await notificarWatchers(taskAId, orgAId, analistaId, 'Status alterado para Em andamento');

    expect(await countUnread(clienteId)).toBeGreaterThanOrEqual(1);
    // analista É watcher mas também é o autor do evento — não se autonotifica.
    const notifsAnalista = await listNotifications(analistaId);
    expect(notifsAnalista.find((n) => n.tipo === 'task_watcher')).toBeUndefined();

    const notifsCliente = await listNotifications(clienteId);
    const item = notifsCliente.find((n) => n.tipo === 'task_watcher');
    expect(item).toBeDefined();
    expect(item!.titulo).toContain('Status alterado para Em andamento');
    expect(item!.corpo).toBe('Tarefa A (watchers/menções)');
  });

  it('notificarWatchers em task sem watchers não notifica ninguém e não lança', async () => {
    const { addWatcher, removeWatcher } = await import('@/modules/tasks/watcher.repository');
    const { notificarWatchers } = await import('@/modules/tasks/task-notifications');

    // esvazia os watchers da taskB (outra org) antes do teste
    await addWatcher(taskBId, orgBId, userBId);
    await removeWatcher(taskBId, orgBId, userBId);

    await expect(notificarWatchers(taskBId, orgBId, userBId, 'evento qualquer')).resolves.toBeUndefined();
  });

  it('notificarWatchers com taskId inexistente não lança (best-effort)', async () => {
    const { notificarWatchers } = await import('@/modules/tasks/task-notifications');

    await expect(
      notificarWatchers('00000000-0000-0000-0000-000000000000', orgAId, analistaId, 'evento'),
    ).resolves.toBeUndefined();
  });

  it('watchers de taskB nunca são afetados por chamadas com orgA (isolamento cross-org)', async () => {
    const { listWatchers } = await import('@/modules/tasks/watcher.repository');
    expect(await listWatchers(taskBId, orgAId)).toEqual([]);
    const rows = await tdb
      .select()
      .from(taskWatchers)
      .where(and(eq(taskWatchers.task_id, taskBId)));
    expect(rows).toEqual([]);
  });
});
