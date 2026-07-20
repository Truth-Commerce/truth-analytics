import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { cycles, organizations, taskWatchers, tasks, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-schemah5-';

describe.skipIf(!url)('schema H5 — hierarquia (parent_id/nivel/labels) + cycles + task_watchers', () => {
  let orgId = '';
  let userId = '';

  afterAll(async () => {
    if (!orgId) return;
    // Ordem de FK: task_watchers → tasks (self-FK, 1 statement cobre pai+filho) → cycles → users → organizations.
    await db.delete(taskWatchers).where(eq(taskWatchers.user_id, userId));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(cycles).where(eq(cycles.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('retrocompat: task inserida sem as colunas novas usa os defaults (nivel=task, parent_id/cycle_id=null, labels=[])', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@ta-test.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;

    const [task] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task-legado`, criado_por: 'ia' })
      .returning();
    expect(task!.nivel).toBe('task');
    expect(task!.parent_id).toBeNull();
    expect(task!.labels).toEqual([]);
    expect(task!.cycle_id).toBeNull();
  });

  it('épico > task > subtask via parent_id; CHECK rejeita nivel inválido', async () => {
    const [epico] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}epico`, criado_por: 'ia', nivel: 'epico' })
      .returning();
    expect(epico!.nivel).toBe('epico');

    const [subtask] = await db
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${PREFIX}subtask`,
        criado_por: 'ia',
        nivel: 'subtask',
        parent_id: epico!.id,
        labels: ['bug', 'urgente'],
      })
      .returning();
    expect(subtask!.nivel).toBe('subtask');
    expect(subtask!.parent_id).toBe(epico!.id);
    expect(subtask!.labels).toEqual(['bug', 'urgente']);

    await expect(
      db.insert(tasks).values({
        org_id: orgId,
        titulo: `${PREFIX}nivel-invalido`,
        criado_por: 'ia',
        nivel: 'nivel_invalido',
      }),
    ).rejects.toThrow();
  });

  it('task_watchers: unique por (task_id, user_id)', async () => {
    const [task] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task-watch`, criado_por: 'ia' })
      .returning();

    await db.insert(taskWatchers).values({ task_id: task!.id, user_id: userId });
    await expect(db.insert(taskWatchers).values({ task_id: task!.id, user_id: userId })).rejects.toThrow();
  });

  it('cycles: default status=planejado; CHECK rejeita status inválido; task associa via cycle_id', async () => {
    const [cycle] = await db.insert(cycles).values({ org_id: orgId, nome: `${PREFIX}ciclo` }).returning();
    expect(cycle!.status).toBe('planejado');

    await expect(
      db.insert(cycles).values({ org_id: orgId, nome: `${PREFIX}ciclo-invalido`, status: 'status_invalido' }),
    ).rejects.toThrow();

    const [task] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task-ciclo`, criado_por: 'ia', cycle_id: cycle!.id })
      .returning();
    expect(task!.cycle_id).toBe(cycle!.id);
  });
});
