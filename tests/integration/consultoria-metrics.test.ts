import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, taskActivities, taskComments, tasks, users } from '@/db/schema';
import { getConsultoriaMetrics, setOrgAnalista } from '@/modules/analista/analista.repository';
import { hashPassword } from '@/modules/auth/password';

const PREFIX = 'ta-test-consultoria-';

describe.skipIf(!process.env.DATABASE_URL_TEST)('getConsultoriaMetrics — integração', () => {
  let orgId = '';
  let analistaId = '';
  let taskId = '';
  const userIds: string[] = [];
  const taskIds: string[] = [];

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');

    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}Org`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [analista] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}an@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = analista!.id;
    userIds.push(analistaId);

    // seed: analista assume a carteira da org
    await setOrgAnalista({ orgId, analistaUserId: analistaId, actorUserId: analistaId });

    // seed: cria uma task e move até concluída (gera a activity de status='concluida')
    const { createTask, moveTask } = await import('@/modules/tasks/task.repository');
    taskId = await createTask({
      orgId,
      titulo: `${PREFIX}Tarefa`,
      tipo: 'catalogo',
      prioridade: 'media',
      criadoPor: 'analista',
      actorUserId: analistaId,
    });
    taskIds.push(taskId);
    await moveTask({ taskId, orgId, ator: 'analista', actorUserId: analistaId, para: 'em_revisao' });
    await moveTask({ taskId, orgId, ator: 'analista', actorUserId: analistaId, para: 'concluida' });
  });

  afterAll(async () => {
    if (taskIds.length) {
      await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
      await db.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
    }
    await db.delete(tasks).where(inArray(tasks.id, taskIds));
    await db.delete(auditLog).where(inArray(auditLog.org_id, [orgId].filter(Boolean)));
    // organizations.analista_id referencia users.id — limpar antes de apagar usuários
    await db.update(organizations).set({ analista_id: null }).where(like(organizations.name, `${PREFIX}%`));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('conta concluídas 7d/30d, calcula tempo médio e traz o analista com orgs>=1 — sempre TOLERANDO >= (banco compartilhado)', async () => {
    const metrics = await getConsultoriaMetrics();

    expect(metrics.concluidas7d).toBeGreaterThanOrEqual(1);
    expect(metrics.concluidas30d).toBeGreaterThanOrEqual(1);
    expect(metrics.concluidas30d).toBeGreaterThanOrEqual(metrics.concluidas7d);
    expect(metrics.tempoMedioConclusaoDias).not.toBeNull();
    expect(metrics.tempoMedioConclusaoDias as number).toBeGreaterThanOrEqual(0);

    const analistaMetrics = metrics.porAnalista.find((a) => a.analistaId === analistaId);
    expect(analistaMetrics).toBeDefined();
    expect(analistaMetrics!.email).toBe(`${PREFIX}an@example.com`);
    expect(analistaMetrics!.orgs).toBeGreaterThanOrEqual(1);
    expect(analistaMetrics!.concluidas30d).toBeGreaterThanOrEqual(1);
  });
});
