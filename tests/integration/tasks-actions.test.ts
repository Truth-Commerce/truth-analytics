import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// ADMIN_ALERT_EMAIL determinístico para os testes de fallback (org sem
// analista → e-mail ao admin). O spread preserva POSTGRES_URL redirecionado
// para o branch test pelo setup.ts (padrão cron-verificar-alertas.test.ts).
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, ADMIN_ALERT_EMAIL: 'admin-alertas@teste.dev' },
  };
});

// Task 8: `toggleChecklistLine` foi extraído para `@/modules/tasks/checklist-line`
// (módulo puro, sem 'use server') — este arquivo não importa mais
// `@/actions/tasks.actions` (que exigiria a instância NextAuth() via
// require-session → session → @/modules/auth/auth, indisponível/quebrada no
// ambiente node do vitest). Este arquivo só exercita o helper puro
// `toggleChecklistLine` e os gatilhos de notificação (que não passam por sessão).
import { toggleChecklistLine } from '@/modules/tasks/checklist-line';
import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';

describe('toggleChecklistLine (helper puro)', () => {
  it('marca o item do índice como concluído', () => {
    expect(toggleChecklistLine('- [ ] a\n- [ ] b', 1)).toBe('- [ ] a\n- [x] b');
  });

  it('desmarca de volta (toggle ida/volta)', () => {
    const marcado = toggleChecklistLine('- [ ] a\n- [ ] b', 1);
    expect(toggleChecklistLine(marcado, 1)).toBe('- [ ] a\n- [ ] b');
  });

  it('index fora do range (negativo ou além do fim) deixa a string intacta', () => {
    const original = '- [ ] a\n- [ ] b';
    expect(toggleChecklistLine(original, -1)).toBe(original);
    expect(toggleChecklistLine(original, 5)).toBe(original);
  });

  it('linha que não é item de checklist fica intacta', () => {
    const original = 'texto livre\n- [ ] item';
    expect(toggleChecklistLine(original, 0)).toBe(original);
  });
});

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-actions-';

describe.skipIf(!url)('task-notifications — gatilhos de notificação (integração)', () => {
  let orgComClienteEAnalistaId = '';
  let orgSemAnalistaId = '';
  let clienteId = '';
  let clienteEmail = '';
  let analistaId = '';
  let analistaEmail = '';

  beforeAll(async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}com-analista-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgComClienteEAnalistaId = orgA!.id;

    const [orgB] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}sem-analista-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgSemAnalistaId = orgB!.id;

    clienteEmail = `${PREFIX}cliente-${RUN}@example.com`;
    const [cliente] = await db
      .insert(users)
      .values({ org_id: orgComClienteEAnalistaId, email: clienteEmail, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    clienteId = cliente!.id;

    // orgSemAnalistaId também precisa de um cliente (para não confundir os dois
    // motivos possíveis de "destinatário null" no teste de notifyTaskEmRevisao).
    await db.insert(users).values({
      org_id: orgSemAnalistaId,
      email: `${PREFIX}cliente-b-${RUN}@example.com`,
      senha_hash: 'hash',
      role: 'client',
    });

    analistaEmail = `${PREFIX}analista-${RUN}@example.com`;
    const [analista] = await db
      .insert(users)
      .values({ org_id: orgComClienteEAnalistaId, email: analistaEmail, senha_hash: 'hash', role: 'analista' })
      .returning({ id: users.id });
    analistaId = analista!.id;

    await db
      .update(organizations)
      .set({ analista_id: analistaId })
      .where(inArray(organizations.id, [orgComClienteEAnalistaId]));
    // orgSemAnalistaId fica de propósito sem analista_id (null).
  });

  afterAll(async () => {
    await db
      .update(organizations)
      .set({ analista_id: null })
      .where(like(organizations.name, `${PREFIX}%`));
    await db.delete(users).where(inArray(users.id, [clienteId, analistaId].filter(Boolean)));
    await db.delete(users).where(like(users.email, `${PREFIX}%`));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('notifyTaskCriada: org com cliente → notify com href correto + e-mail ao cliente', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const emailSpy = vi.spyOn(emailMod, 'sendTaskCriadaEmail').mockResolvedValue(undefined);

    const { notifyTaskCriada } = await import('@/modules/tasks/task-notifications');
    const taskId = 'tarefa-fake-1';
    await notifyTaskCriada(orgComClienteEAnalistaId, taskId, 'Corrigir preço do SKU-1');

    expect(notifySpy).toHaveBeenCalledWith(
      clienteId,
      expect.objectContaining({
        tipo: 'task_criada',
        corpo: 'Corrigir preço do SKU-1',
        href: `/dashboard/plano-de-acao/${taskId}`,
      }),
    );
    expect(emailSpy).toHaveBeenCalledWith(
      clienteEmail,
      'Corrigir preço do SKU-1',
      expect.stringContaining(`/dashboard/plano-de-acao/${taskId}`),
    );

    notifySpy.mockRestore();
    emailSpy.mockRestore();
  });

  it('notifyTaskEmRevisao: org SEM analista → sem in-app; com ADMIN_ALERT_EMAIL → e-mail de fallback', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const emailSpy = vi.spyOn(emailMod, 'sendTaskRevisaoEmail').mockResolvedValue(undefined);

    const { notifyTaskEmRevisao } = await import('@/modules/tasks/task-notifications');
    await expect(
      notifyTaskEmRevisao(orgSemAnalistaId, 'tarefa-fake-2', 'Revisar catálogo'),
    ).resolves.toBeUndefined();
    expect(notifySpy).not.toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalledWith(
      'admin-alertas@teste.dev',
      'Revisar catálogo',
      expect.stringContaining('/analista/'),
    );

    notifySpy.mockRestore();
    emailSpy.mockRestore();
  });

  it('notifyTaskEmRevisao: org com analista → notify + e-mail de revisão ao analista', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const emailSpy = vi.spyOn(emailMod, 'sendTaskRevisaoEmail').mockResolvedValue(undefined);

    const { notifyTaskEmRevisao } = await import('@/modules/tasks/task-notifications');
    const taskId = 'tarefa-fake-3';
    await notifyTaskEmRevisao(orgComClienteEAnalistaId, taskId, 'Revisar catálogo');

    expect(notifySpy).toHaveBeenCalledWith(
      analistaId,
      expect.objectContaining({
        tipo: 'task_em_revisao',
        href: `/analista/${orgComClienteEAnalistaId}/tasks/${taskId}`,
      }),
    );
    expect(emailSpy).toHaveBeenCalledWith(
      analistaEmail,
      'Revisar catálogo',
      expect.stringContaining(`/analista/${orgComClienteEAnalistaId}/tasks/${taskId}`),
    );

    notifySpy.mockRestore();
    emailSpy.mockRestore();
  });

  it('notifyTaskCriadaPeloCliente: org com analista → notify com href do analista + e-mail', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const emailSpy = vi.spyOn(emailMod, 'sendTaskRevisaoEmail').mockResolvedValue(undefined);

    const { notifyTaskCriadaPeloCliente } = await import('@/modules/tasks/task-notifications');
    const taskId = 'tarefa-fake-7';
    await notifyTaskCriadaPeloCliente(orgComClienteEAnalistaId, taskId, 'Task criada pelo cliente');

    expect(notifySpy).toHaveBeenCalledWith(
      analistaId,
      expect.objectContaining({
        tipo: 'task_criada_cliente',
        corpo: 'Task criada pelo cliente',
        href: `/analista/${orgComClienteEAnalistaId}/tasks/${taskId}`,
      }),
    );
    expect(emailSpy).toHaveBeenCalledWith(analistaEmail, 'Task criada pelo cliente', expect.any(String));

    notifySpy.mockRestore();
    emailSpy.mockRestore();
  });

  it('notifyTaskCriadaPeloCliente: org SEM analista → sem in-app; e-mail de fallback ao admin', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const emailSpy = vi.spyOn(emailMod, 'sendTaskRevisaoEmail').mockResolvedValue(undefined);

    const { notifyTaskCriadaPeloCliente } = await import('@/modules/tasks/task-notifications');
    await notifyTaskCriadaPeloCliente(orgSemAnalistaId, 'tarefa-fake-8', 'Task órfã');

    expect(notifySpy).not.toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalledWith('admin-alertas@teste.dev', 'Task órfã', expect.any(String));

    notifySpy.mockRestore();
    emailSpy.mockRestore();
  });

  it('notifyTasksDoRelatorioParaAnalista: com analista → href /analista/{orgId}; sem → e-mail admin', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const emailSpy = vi.spyOn(emailMod, 'sendTaskRevisaoEmail').mockResolvedValue(undefined);

    const { notifyTasksDoRelatorioParaAnalista } = await import('@/modules/tasks/task-notifications');
    await notifyTasksDoRelatorioParaAnalista(orgComClienteEAnalistaId, 'relatorio-fake-1', 3);

    expect(notifySpy).toHaveBeenCalledWith(
      analistaId,
      expect.objectContaining({
        tipo: 'tasks_do_relatorio_cliente',
        corpo: 'Cliente criou 3 tarefa(s) a partir do relatório',
        href: `/analista/${orgComClienteEAnalistaId}`,
      }),
    );

    notifySpy.mockClear();
    emailSpy.mockClear();

    await notifyTasksDoRelatorioParaAnalista(orgSemAnalistaId, 'relatorio-fake-2', 1);
    expect(notifySpy).not.toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalledWith(
      'admin-alertas@teste.dev',
      'Cliente criou 1 tarefa(s) a partir do relatório',
      expect.stringContaining(`/analista/${orgSemAnalistaId}`),
    );

    notifySpy.mockRestore();
    emailSpy.mockRestore();
  });

  it('notifyTaskAprovada e notifyTaskDevolvida notificam o cliente com e-mail correspondente', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const aprovadaSpy = vi.spyOn(emailMod, 'sendTaskAprovadaEmail').mockResolvedValue(undefined);
    const devolvidaSpy = vi.spyOn(emailMod, 'sendTaskDevolvidaEmail').mockResolvedValue(undefined);

    const { notifyTaskAprovada, notifyTaskDevolvida } = await import('@/modules/tasks/task-notifications');
    await notifyTaskAprovada(orgComClienteEAnalistaId, 'tarefa-fake-4', 'Ajustar frete');
    await notifyTaskDevolvida(orgComClienteEAnalistaId, 'tarefa-fake-5', 'Ajustar frete');

    expect(notifySpy).toHaveBeenCalledWith(clienteId, expect.objectContaining({ tipo: 'task_aprovada' }));
    expect(notifySpy).toHaveBeenCalledWith(clienteId, expect.objectContaining({ tipo: 'task_devolvida' }));
    expect(aprovadaSpy).toHaveBeenCalledWith(clienteEmail, 'Ajustar frete', expect.any(String));
    expect(devolvidaSpy).toHaveBeenCalledWith(clienteEmail, 'Ajustar frete', expect.any(String));

    notifySpy.mockRestore();
    aprovadaSpy.mockRestore();
    devolvidaSpy.mockRestore();
  });

  it('notifyTaskComentario: autor cliente → notifica analista; autor analista → notifica cliente', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const emailMod = await import('@/modules/notifications/email');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);
    const emailSpy = vi.spyOn(emailMod, 'sendTaskComentarioEmail').mockResolvedValue(undefined);

    const { notifyTaskComentario } = await import('@/modules/tasks/task-notifications');
    const taskId = 'tarefa-fake-6';

    await notifyTaskComentario(orgComClienteEAnalistaId, taskId, 'Novo comentário do cliente', true);
    expect(notifySpy).toHaveBeenCalledWith(
      analistaId,
      expect.objectContaining({ tipo: 'task_comentario', href: `/analista/${orgComClienteEAnalistaId}/tasks/${taskId}` }),
    );
    expect(emailSpy).toHaveBeenCalledWith(analistaEmail, 'Novo comentário do cliente', expect.any(String));

    notifySpy.mockClear();
    emailSpy.mockClear();

    await notifyTaskComentario(orgComClienteEAnalistaId, taskId, 'Novo comentário do analista', false);
    expect(notifySpy).toHaveBeenCalledWith(
      clienteId,
      expect.objectContaining({ tipo: 'task_comentario', href: `/dashboard/plano-de-acao/${taskId}` }),
    );
    expect(emailSpy).toHaveBeenCalledWith(clienteEmail, 'Novo comentário do analista', expect.any(String));

    notifySpy.mockRestore();
    emailSpy.mockRestore();
  });
});
