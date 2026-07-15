import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Sem contexto de request nos testes de action: revalidatePath e a sessão
// precisam de stub (padrão password-reset-actions.test.ts).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const sessaoMock = { access: null as unknown };
vi.mock('@/modules/auth/require-session', () => ({
  requireSession: async () => sessaoMock.access,
}));

import { db } from '@/db/client';
import { organizations, taskActivities, tasks, users } from '@/db/schema';
import { deleteTaskFormAction, updateTaskAction } from '@/actions/tasks.actions';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-edicao-';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

describe.skipIf(!url)('edição/exclusão de task via actions (integração)', () => {
  let orgId = '';
  let adminId = '';
  let taskId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [admin] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'h', role: 'admin_truth' })
      .returning({ id: users.id });
    adminId = admin!.id;
    const [t] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task-${RUN}`, criado_por: 'analista', prioridade: 'media' })
      .returning({ id: tasks.id });
    taskId = t!.id;
  });

  afterAll(async () => {
    // FK: task_activities → tasks (cobre também tasks extras criadas nos testes,
    // caso um deleteTaskFormAction tenha falhado no meio do caminho).
    const restantes = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    const ids = restantes.map((t) => t.id);
    if (ids.length > 0) await db.delete(taskActivities).where(inArray(taskActivities.task_id, ids));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('admin edita titulo/prioridade/prazo', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
    const r = await updateTaskAction(
      {},
      form({ orgId, taskId, titulo: 'Título editado pelo admin', prioridade: 'alta', prazo: '2026-08-01' }),
    );
    expect(r.ok).toBe(true);
    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(t!.titulo).toBe('Título editado pelo admin');
    expect(t!.prioridade).toBe('alta');
    expect(t!.prazo).toBe('2026-08-01');
  });

  it('cliente é bloqueado pela action', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'client', orgStatus: 'active', plano: null };
    const r = await updateTaskAction({}, form({ taskId, titulo: 'Hack do cliente' }));
    expect(r.error).toBe('Você não tem permissão para editar esta tarefa.');
  });

  it('deleteTaskFormAction com redirectTo exclui e redireciona', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
    let redirecionou = false;
    try {
      await deleteTaskFormAction(form({ orgId, taskId, redirectTo: `/analista/${orgId}` }));
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
      redirecionou = true;
    }
    expect(redirecionou).toBe(true);
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(rows).toHaveLength(0);
  });

  it('redirectTo externo (protocol-relative "//") é recusado: exclui sem redirecionar', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
    const [t2] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task2-${RUN}`, criado_por: 'analista', prioridade: 'media' })
      .returning({ id: tasks.id });

    // Não deve lançar NEXT_REDIRECT — retorno normal (fire-and-refresh).
    await expect(
      deleteTaskFormAction(form({ orgId, taskId: t2!.id, redirectTo: '//evil.example.com' })),
    ).resolves.toBeUndefined();

    const rows = await db.select().from(tasks).where(eq(tasks.id, t2!.id));
    expect(rows).toHaveLength(0);
  });
});
