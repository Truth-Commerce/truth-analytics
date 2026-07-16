import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks } from '@/db/schema';
import { toggleChecklistItemTx } from '@/modules/tasks/task.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-toggle-';

const DESCRICAO = ['Contexto livre', '- [ ] Conferir frete', '- [ ] Ajustar preço'].join('\n');

describe.skipIf(!url)('toggleChecklistItemTx — atômico sob concorrência', () => {
  let orgId = '';
  let taskId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [t] = await db
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${PREFIX}task-${RUN}`,
        descricao: DESCRICAO,
        tipo: 'logistica',
        prioridade: 'media',
        status: 'em_andamento',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskId = t!.id;
  });

  afterAll(async () => {
    await db.delete(taskActivities).where(eq(taskActivities.task_id, taskId));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('marca e desmarca a linha certa (índice CRU da descrição)', async () => {
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 1, actorUserId: null })).toBe(true);
    let [row] = await db.select({ d: tasks.descricao }).from(tasks).where(eq(tasks.id, taskId));
    expect(row!.d.split('\n')[1]).toBe('- [x] Conferir frete');
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 1, actorUserId: null })).toBe(true);
    [row] = await db.select({ d: tasks.descricao }).from(tasks).where(eq(tasks.id, taskId));
    expect(row!.d).toBe(DESCRICAO);
  });

  it('linha não-checklist e índice fora do range são no-op (false)', async () => {
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 0, actorUserId: null })).toBe(false);
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 99, actorUserId: null })).toBe(false);
  });

  it('dois toggles CONCORRENTES do mesmo item serializam (estado volta ao original, nunca update perdido)', async () => {
    await Promise.all([
      toggleChecklistItemTx({ taskId, orgId, index: 2, actorUserId: null }),
      toggleChecklistItemTx({ taskId, orgId, index: 2, actorUserId: null }),
    ]);
    const [row] = await db.select({ d: tasks.descricao }).from(tasks).where(eq(tasks.id, taskId));
    // Com FOR UPDATE os dois serializam: toggle + toggle = original.
    // O read-modify-write antigo podia aplicar os dois sobre a MESMA base (update perdido → '- [x]').
    expect(row!.d.split('\n')[2]).toBe('- [ ] Ajustar preço');
  });

  it('task de outra org → task_nao_encontrada', async () => {
    await expect(
      toggleChecklistItemTx({ taskId, orgId: '00000000-0000-0000-0000-000000000000', index: 1, actorUserId: null }),
    ).rejects.toThrow('task_nao_encontrada');
  });
});
