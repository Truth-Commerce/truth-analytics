import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Sem contexto de request nos testes de action: revalidatePath e a sessão
// precisam de stub (padrão password-reset-actions.test.ts).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const sessaoMock = { access: null as unknown };
vi.mock('@/modules/auth/require-session', () => ({
  requireSession: async () => sessaoMock.access,
}));

// resolveTaskContext agora chama assertNaoImpersonando() (fix pós-Task 12),
// que lê cookies() de next/headers — indisponível fora de um request real do
// Next (mesmo problema documentado em tests/integration/impersonation-flow.test.ts).
// Cookie store compartilhado: os testes de edição/exclusão nunca plantam o
// cookie de impersonação (get() devolve undefined, comportamento "sem
// cookie" de antes desta mudança); o describe de impersonação no fim do
// arquivo planta e limpa o cookie a cada teste (afterEach próprio).
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
import { notifications, organizations, reports, taskActivities, tasks, taskTemplates, users } from '@/db/schema';
import {
  concluirTaskFormAction,
  createTaskAction,
  createTasksFromReportAction,
  deleteTaskFormAction,
  updateTaskAction,
} from '@/actions/tasks.actions';
import { hojeBrt } from '@/lib/timezone';
import { assinarImpersonation, IMPERSONATION_COOKIE } from '@/modules/auth/impersonation';
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
  let taskAutorId = '';

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
    // Task própria para o caso de autoria da timeline (não colide com o de exclusão).
    const [tAutor] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task-autor-${RUN}`, criado_por: 'analista', prioridade: 'media' })
      .returning({ id: tasks.id });
    taskAutorId = tAutor!.id;
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

  it('listTaskActivities devolve o autor (userEmail) e null para eventos de sistema', async () => {
    const { listTaskActivities, recordTaskActivity } = await import(
      '@/modules/tasks/task-activity.repository'
    );
    await recordTaskActivity({ taskId: taskAutorId, userId: adminId, evento: 'editada' });
    await recordTaskActivity({
      taskId: taskAutorId,
      userId: null,
      evento: 'lembrete_prazo',
      de: '2026-08-01',
      para: 'atrasada',
    });
    const acts = await listTaskActivities(taskAutorId, orgId);
    expect(acts.find((a) => a.evento === 'editada')?.userEmail).toContain('@example.com');
    expect(acts.find((a) => a.evento === 'lembrete_prazo')?.userEmail).toBeNull();
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

  it('prazo com data de calendário impossível é recusado (não cria/edita → sem 500 no Postgres)', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
    // createTaskSchema.prazo: '2026-13-99' passa no regex mas não é data real.
    const rCreate = await createTaskAction(
      {},
      form({ orgId, titulo: 'Task com data invalida', tipo: 'outro', prioridade: 'media', prazo: '2026-13-99' }),
    );
    expect(rCreate.error).toBe('Dados inválidos. Confira os campos e tente novamente.');
    const criadas = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.org_id, orgId), eq(tasks.titulo, 'Task com data invalida')));
    expect(criadas).toHaveLength(0);

    // updateTaskSchema.prazo: 30 de fevereiro também é recusado.
    const rUpdate = await updateTaskAction({}, form({ orgId, taskId, prazo: '2026-02-30' }));
    expect(rUpdate.error).toBe('Dados inválidos. Confira os campos e tente novamente.');
  });

  // F2 (revisão H5/T11): "Nova task" agora deixa escolher nivel='epico' —
  // antes disso, nada na UI criava um épico (criarEpico só era exercitada por
  // teste), então progresso de épico/filtro-por-épico/swimlane-por-épico
  // ficavam permanentemente mortos.
  it('createTaskAction com nivel="epico" cria uma task nivel=epico, sem parent (raiz da hierarquia)', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
    const r = await createTaskAction(
      {},
      form({ orgId, titulo: 'Épico via Nova task', tipo: 'outro', prioridade: 'media', nivel: 'epico' }),
    );
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
    expect(row?.nivel).toBe('epico');
    expect(row?.parent_id).toBeNull();
  });

  it('createTaskAction sem nivel informado continua criando nivel="task" (retrocompat)', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
    const r = await createTaskAction(
      {},
      form({ orgId, titulo: 'Task normal via Nova task', tipo: 'outro', prioridade: 'media' }),
    );
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
    expect(row?.nivel).toBe('task');
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

// ---------------------------------------------------------------------------
// Impersonação — fix pós-Task 12 (2 breaches achados na revisão H4 T12):
// C1 createTasksFromReportAction e C2 concluirTaskFormAction/
// resolveTaskContext mutavam a org do CLIENTE mesmo com o admin em modo "ver
// como cliente". Root cause: os dois resolvem contexto via requireSession()
// direto — que devolve a sessão REAL (admin_truth), nunca o UserAccess
// sintético que só requireActiveOrg enxerga. O guard assertNaoImpersonando
// planta/lê o MESMO cookie HMAC que iniciarImpersonationAction gravaria.
// ---------------------------------------------------------------------------
const SAMPLE_ANALISE_IMPERSON = {
  resumoExecutivo: 'Resumo de teste para o fluxo de impersonação.',
  gargalos: ['Gargalo de teste para impersonação'],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe.skipIf(!url)('impersonação — tasks.actions.ts bloqueia mutações (fix pós-Task 12)', () => {
  const PREFIX_I = 'ta-test-edicao-imperson-';
  // Escopo próprio (independente do describe de edição/exclusão acima — `let
  // orgId`/`let adminId` daquele bloco não são visíveis aqui): org "casa" do
  // admin_truth + a própria conta admin.
  let orgAdminId = '';
  let adminId = '';
  let orgClienteId = '';
  let clienteRealId = '';
  let reportId = '';
  let taskId2 = '';

  beforeAll(async () => {
    const [orgAdmin] = await db
      .insert(organizations)
      .values({ name: `${PREFIX_I}admin-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAdminId = orgAdmin!.id;

    const [admin] = await db
      .insert(users)
      .values({ org_id: orgAdminId, email: `${PREFIX_I}admin-${RUN}@example.com`, senha_hash: 'h', role: 'admin_truth' })
      .returning({ id: users.id });
    adminId = admin!.id;

    const [orgCliente] = await db
      .insert(organizations)
      .values({ name: `${PREFIX_I}cliente-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgClienteId = orgCliente!.id;

    // Usuário cliente REAL (não o admin impersonando) — precisa existir de
    // verdade: task_activities.user_id é FK p/ users(id) (uuid), então o
    // teste de regressão do cliente real usa este id, não um literal.
    const [clienteReal] = await db
      .insert(users)
      .values({
        org_id: orgClienteId,
        email: `${PREFIX_I}cliente-real-${RUN}@example.com`,
        senha_hash: 'h',
        role: 'client',
      })
      .returning({ id: users.id });
    clienteRealId = clienteReal!.id;

    const [report] = await db
      .insert(reports)
      .values({
        org_id: orgClienteId,
        status: 'done',
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        analise_ia: SAMPLE_ANALISE_IMPERSON,
      })
      .returning({ id: reports.id });
    reportId = report!.id;

    const [t] = await db
      .insert(tasks)
      .values({
        org_id: orgClienteId,
        titulo: `${PREFIX_I}task-${RUN}`,
        criado_por: 'analista',
        prioridade: 'media',
      })
      .returning({ id: tasks.id });
    taskId2 = t!.id;
  });

  afterAll(async () => {
    const restantes = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgClienteId));
    const ids = restantes.map((r) => r.id);
    if (ids.length > 0) await db.delete(taskActivities).where(inArray(taskActivities.task_id, ids));
    await db.delete(tasks).where(eq(tasks.org_id, orgClienteId));
    await db.delete(reports).where(eq(reports.org_id, orgClienteId));
    // notifyTasksDoRelatorio (regressão sem cookie) grava notificação in-app
    // pro cliente real — FK notifications.user_id → users.id bloquearia o
    // delete de users abaixo se não limparmos primeiro.
    await db.delete(notifications).where(eq(notifications.user_id, clienteRealId));
    await db.delete(users).where(eq(users.org_id, orgClienteId));
    await db.delete(organizations).where(eq(organizations.id, orgClienteId));
    await db.delete(users).where(eq(users.org_id, orgAdminId));
    await db.delete(organizations).where(eq(organizations.id, orgAdminId));
  });

  afterEach(() => {
    cookieStore.clear();
  });

  it('C1 fechado: admin_truth REAL sob impersonação (cookie válido p/ orgCliente) → createTasksFromReportAction lança "Modo visualização" e cria ZERO tasks', async () => {
    // A sessão REAL nunca deixa de ser admin_truth durante impersonação —
    // requireSession() (usado por esta action) só enxerga essa sessão real.
    sessaoMock.access = { id: adminId, orgId: orgAdminId, role: 'admin_truth', orgStatus: 'active', plano: null };
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgClienteId, adminId, new Date()));

    await expect(
      createTasksFromReportAction(
        {},
        form({ reportId, itens: JSON.stringify([{ fonte: 'gargalos', indice: 0 }]) }),
      ),
    ).rejects.toThrow('Modo visualização: ações desabilitadas');

    const rows = await db.select().from(tasks).where(eq(tasks.report_id, reportId));
    expect(rows).toHaveLength(0);
  });

  it('C2 fechado: admin_truth REAL sob impersonação + orgId do cliente no form (hidden input do TaskDetail durante "ver como cliente") → concluirTaskFormAction lança e a task fica INTACTA', async () => {
    sessaoMock.access = { id: adminId, orgId: orgAdminId, role: 'admin_truth', orgStatus: 'active', plano: null };
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgClienteId, adminId, new Date()));

    const [antes] = await db.select().from(tasks).where(eq(tasks.id, taskId2));
    expect(antes!.status).toBe('backlog');

    // orgId = orgCliente: exatamente o que TaskDetail.tsx manda no hidden
    // input <input name="orgId" value={access.orgId}> quando access.orgId
    // vem do UserAccess sintético (requireActiveOrg) durante impersonação.
    await expect(
      concluirTaskFormAction(form({ taskId: taskId2, orgId: orgClienteId })),
    ).rejects.toThrow('Modo visualização: ações desabilitadas');

    const [depois] = await db.select().from(tasks).where(eq(tasks.id, taskId2));
    expect(depois!.status).toBe('backlog'); // nunca chegou a mover — moveTask não rodou
  });

  it('regressão: admin_truth SEM cookie de impersonação → createTasksFromReportAction continua funcionando normalmente', async () => {
    sessaoMock.access = { id: adminId, orgId: orgAdminId, role: 'admin_truth', orgStatus: 'active', plano: null };
    // sem cookie plantado

    const r = await createTasksFromReportAction(
      {},
      form({ reportId, itens: JSON.stringify([{ fonte: 'gargalos', indice: 0 }]) }),
    );
    expect(r.ok).toBe(true);
    expect(r.criadas).toBe(1);

    const rows = await db.select().from(tasks).where(eq(tasks.report_id, reportId));
    expect(rows).toHaveLength(1);
  });

  it('regressão: cliente real (sem cookie) continua concluindo a própria task normalmente', async () => {
    sessaoMock.access = {
      id: clienteRealId,
      orgId: orgClienteId,
      role: 'client',
      orgStatus: 'active',
      plano: 'monthly',
    };
    // sem cookie plantado

    await concluirTaskFormAction(form({ taskId: taskId2 }));

    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId2));
    expect(t!.status).toBe('em_revisao'); // proximoStatusAoConcluir('analista')
  });

  it('assertNaoImpersonando: só um cookie de impersonação VÁLIDO e NÃO vencido bloqueia — ausente/vencido/adulterado nunca bloqueiam', async () => {
    const { assertNaoImpersonando } = await import('@/modules/auth/require-active-org');

    await expect(assertNaoImpersonando()).resolves.toBeUndefined(); // sem cookie

    const vencido = new Date(Date.now() - 60 * 60 * 1000);
    cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgClienteId, adminId, vencido));
    await expect(assertNaoImpersonando()).resolves.toBeUndefined(); // vencido
    cookieStore.clear();

    const valido = assinarImpersonation(orgClienteId, adminId, new Date());
    cookieStore.set(IMPERSONATION_COOKIE, `${valido}adulterado`);
    await expect(assertNaoImpersonando()).resolves.toBeUndefined(); // assinatura quebrada
    cookieStore.clear();

    cookieStore.set(IMPERSONATION_COOKIE, valido);
    await expect(assertNaoImpersonando()).rejects.toThrow('Modo visualização: ações desabilitadas'); // válido → bloqueia
  });
});
