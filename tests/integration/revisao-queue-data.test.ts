import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, tasks, users } from '@/db/schema';
import { listTasksEmRevisao } from '@/modules/analista/analista.repository';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';

const PREFIX = 'ta-test-revq-';

describe.skipIf(!process.env.DATABASE_URL_TEST)('fila de revisão com contexto (dados)', () => {
  let orgId = '';
  let analistaId = '';
  let taskId = '';

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [analista] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}an@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = analista.id;

    await db.update(organizations).set({ analista_id: analistaId }).where(inArray(organizations.id, [orgId]));

    const [task] = await db
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${PREFIX}em-revisao`,
        tipo: 'outro',
        prioridade: 'alta',
        status: 'em_revisao',
        criado_por: 'cliente',
      })
      .returning({ id: tasks.id });
    taskId = task.id;
  });

  afterAll(async () => {
    await db.delete(tasks).where(inArray(tasks.id, [taskId].filter(Boolean)));
    // organizations.analista_id referencia users.id (sem ON DELETE) — limpar
    // antes de apagar o usuário, senão a FK bloqueia o delete.
    await db.update(organizations).set({ analista_id: null }).where(like(organizations.name, `${PREFIX}%`));
    await db.delete(users).where(inArray(users.id, [analistaId].filter(Boolean)));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('listTasksEmRevisao devolve updatedAt (Date) e orgName da org da carteira', async () => {
    const fila = await listTasksEmRevisao({
      id: analistaId,
      orgId,
      role: 'analista',
      orgStatus: 'active',
      plano: null,
    } as UserAccess);

    const item = fila.find((t) => t.id === taskId);
    expect(item).toBeDefined();
    expect(item!.orgName).toBe(`${PREFIX}org`);
    expect(item!.updatedAt).toBeInstanceOf(Date);
  });
});
