import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Mesmo padrão de tests/integration/tasks-actions-crm.test.ts /
// cycles-actions.test.ts: tasks.actions resolve sessão via requireSession()
// direto e o guard de impersonação lê cookies() de next/headers.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const sessaoMock = { access: null as unknown };
vi.mock('@/modules/auth/require-session', () => ({
  requireSession: async () => sessaoMock.access,
}));

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

import { db } from '@/db/client';
import { organizations, taskActivities, tasks, users } from '@/db/schema';
import { criarSubtarefaFormAction } from '@/actions/tasks.actions';
import { assinarImpersonation, IMPERSONATION_COOKIE } from '@/modules/auth/impersonation';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-criar-subtarefa-act-';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

// ---------------------------------------------------------------------------
// F2 (revisão H5/T11) — criarSubtarefaFormAction é o único ponto da UI que
// cria um FILHO de uma task existente (épico > task > subtask); até este
// fix, nenhuma action/form/botão chamava criarSubtarefa — só testes.
// ---------------------------------------------------------------------------
describe.skipIf(!url)('criarSubtarefaFormAction (integração, F2)', () => {
  let clienteId = '';
  let adminId = '';
  let orgId = '';
  let epicoId = '';
  let taskId = '';
  let subtaskId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    // user_id de task_activities é uuid (FK pra users) — recordTaskActivity
    // (disparado por createTask dentro de criarSubtarefa) exige um UUID real,
    // não um literal fake (diferente de cycles, que não grava actorUserId).
    const [admin] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}admin-${RUN}@example.com`, senha_hash: 'h', role: 'admin_truth' })
      .returning({ id: users.id });
    adminId = admin!.id;

    const [cliente] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}cliente-${RUN}@example.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    clienteId = cliente!.id;

    const [epico] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}epico`, criado_por: 'analista', prioridade: 'media', nivel: 'epico' })
      .returning({ id: tasks.id });
    epicoId = epico!.id;

    const [task] = await db
      .insert(tasks)
      .values({
        org_id: orgId, titulo: `${PREFIX}task`, criado_por: 'analista', prioridade: 'media',
        nivel: 'task', parent_id: epicoId,
      })
      .returning({ id: tasks.id });
    taskId = task!.id;

    const [subtask] = await db
      .insert(tasks)
      .values({
        org_id: orgId, titulo: `${PREFIX}subtask`, criado_por: 'analista', prioridade: 'media',
        nivel: 'subtask', parent_id: taskId,
      })
      .returning({ id: tasks.id });
    subtaskId = subtask!.id;
  });

  afterAll(async () => {
    const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    const taskIds = taskRows.map((t) => t.id);
    if (taskIds.length > 0) await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  afterEach(() => {
    cookieStore.clear();
  });

  function acessoCliente() {
    sessaoMock.access = { id: clienteId, orgId, role: 'client', orgStatus: 'active', plano: 'monthly' };
  }

  function acessoAdmin() {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
  }

  function acessoAdminImpersonando() {
    sessaoMock.access = { id: adminId, orgId: 'org-interna-fake', role: 'admin_truth', orgStatus: 'active', plano: null };
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgId, adminId, new Date()));
  }

  it('cria uma task filha (nivel=task) do épico, com o parentId e nivel corretos', async () => {
    acessoAdmin();
    const r = await criarSubtarefaFormAction(
      {},
      form({ orgId, parentId: epicoId, nivel: 'task', titulo: 'Task filha via action', tipo: 'outro', prioridade: 'media' }),
    );
    expect(r.ok).toBe(true);
    expect(r.taskId).toBeTruthy();

    const [row] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
    expect(row?.nivel).toBe('task');
    expect(row?.parent_id).toBe(epicoId);
    expect(row?.org_id).toBe(orgId);
  });

  it('cliente cria uma subtarefa (nivel=subtask) da própria task', async () => {
    acessoCliente();
    const r = await criarSubtarefaFormAction(
      {},
      form({ parentId: taskId, nivel: 'subtask', titulo: 'Subtarefa via action (cliente)', tipo: 'outro', prioridade: 'baixa' }),
    );
    expect(r.ok).toBe(true);

    const [row] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
    expect(row?.nivel).toBe('subtask');
    expect(row?.parent_id).toBe(taskId);
    expect(row?.criado_por).toBe('cliente');
  });

  it('rejeita combinação de nível inválida (subtask direto como filha de épico) — nenhuma task criada', async () => {
    acessoAdmin();
    const antes = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));

    const r = await criarSubtarefaFormAction(
      {},
      form({ orgId, parentId: epicoId, nivel: 'subtask', titulo: 'Inválida: subtask de épico', tipo: 'outro', prioridade: 'media' }),
    );
    expect(r.error).toBeTruthy();

    const depois = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    expect(depois).toHaveLength(antes.length); // nada novo foi criado
  });

  it('rejeita nível inválido quando o pai é uma subtask (nível-folha, sem filhos válidos)', async () => {
    acessoAdmin();
    const r = await criarSubtarefaFormAction(
      {},
      form({ orgId, parentId: subtaskId, nivel: 'subtask', titulo: 'Inválida: filha de subtask', tipo: 'outro', prioridade: 'media' }),
    );
    expect(r.error).toBeTruthy();
  });

  it('impersonação bloqueia criarSubtarefaFormAction (lança) — nenhuma task criada', async () => {
    acessoAdminImpersonando();
    const antes = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));

    await expect(
      criarSubtarefaFormAction(
        {},
        form({ orgId, parentId: epicoId, nivel: 'task', titulo: 'Task impersonada', tipo: 'outro', prioridade: 'media' }),
      ),
    ).rejects.toThrow('Modo visualização: ações desabilitadas');

    const depois = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    expect(depois).toHaveLength(antes.length);
  });
});
