import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Sem contexto de request nos testes de action: revalidatePath e a sessão
// precisam de stub (padrão password-reset-actions.test.ts).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const sessaoMock = { access: null as unknown };
vi.mock('@/modules/auth/require-session', () => ({
  requireSession: async () => sessaoMock.access,
}));

import { db } from '@/db/client';
import { organizations, taskActivities, tasks, taskTemplates, users } from '@/db/schema';
import { createTaskAction, deleteTaskFormAction, updateTaskAction } from '@/actions/tasks.actions';
import { hojeBrt } from '@/lib/timezone';
import { somarDias } from '@/modules/tasks/sla';

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

  it('redirectTo com backslash ("/\\evil.com" — WHATWG trata \\ como /) é recusado: exclui sem redirecionar', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
    const [t3] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task3-${RUN}`, criado_por: 'analista', prioridade: 'media' })
      .returning({ id: tasks.id });

    // '/\evil.com' passa em startsWith('/') e não em startsWith('//'), mas o
    // parser WHATWG normaliza '\' para '/' em http(s) → resolveria externo.
    await expect(
      deleteTaskFormAction(form({ orgId, taskId: t3!.id, redirectTo: '/\\evil.com' })),
    ).resolves.toBeUndefined();

    const rows = await db.select().from(tasks).where(eq(tasks.id, t3!.id));
    expect(rows).toHaveLength(0);
  });

  describe('createTaskAction com template (integração)', () => {
    it('template desativado → erro, NÃO cria task placeholder', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      const [tpl] = await db
        .insert(taskTemplates)
        .values({ titulo: `${PREFIX}tpl-off-${RUN}`, tipo: 'preco', ativo: false })
        .returning({ id: taskTemplates.id });
      try {
        const r = await createTaskAction(
          {},
          form({ orgId, titulo: 'Task de template', tipo: 'outro', prioridade: 'media', templateId: tpl!.id }),
        );
        expect(r.error).toBe('Template indisponível. Atualize a página e tente novamente.');
        const criadas = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.org_id, orgId), eq(tasks.titulo, 'Task de template')));
        expect(criadas).toHaveLength(0);
      } finally {
        await db.delete(taskTemplates).where(eq(taskTemplates.id, tpl!.id));
      }
    });

    it('template inexistente → mesmo erro honesto', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      const r = await createTaskAction(
        {},
        form({
          orgId,
          titulo: 'Task de template',
          tipo: 'outro',
          prioridade: 'media',
          templateId: '00000000-0000-0000-0000-000000000000',
        }),
      );
      expect(r.error).toBe('Template indisponível. Atualize a página e tente novamente.');
    });

    it('template ativo aplica prioridade e prazo_dias do playbook', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      const [tpl] = await db
        .insert(taskTemplates)
        .values({ titulo: `${PREFIX}tpl-on-${RUN}`, tipo: 'preco', ativo: true, prioridade: 'alta', prazo_dias: 5 })
        .returning({ id: taskTemplates.id });
      try {
        const r = await createTaskAction(
          {},
          form({ orgId, titulo: 'Task de template', tipo: 'outro', prioridade: 'media', templateId: tpl!.id }),
        );
        expect(r.ok).toBe(true);
        const [t] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
        expect(t!.titulo).toBe(`${PREFIX}tpl-on-${RUN}`);
        expect(t!.prioridade).toBe('alta');
        expect(t!.prazo).toBe(somarDias(hojeBrt(), 5));
      } finally {
        await db.delete(taskTemplates).where(eq(taskTemplates.id, tpl!.id));
      }
    });

    it('prazo do form vence o prazo_dias do playbook', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      const [tpl] = await db
        .insert(taskTemplates)
        .values({ titulo: `${PREFIX}tpl-form-${RUN}`, tipo: 'preco', ativo: true, prioridade: 'alta', prazo_dias: 5 })
        .returning({ id: taskTemplates.id });
      try {
        const r = await createTaskAction(
          {},
          form({
            orgId,
            titulo: 'Task de template',
            tipo: 'outro',
            prioridade: 'media',
            prazo: '2027-01-15',
            templateId: tpl!.id,
          }),
        );
        expect(r.ok).toBe(true);
        const [t] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
        expect(t!.prazo).toBe('2027-01-15');
      } finally {
        await db.delete(taskTemplates).where(eq(taskTemplates.id, tpl!.id));
      }
    });
  });
});
