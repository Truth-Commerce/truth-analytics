import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// `tasks.actions.ts` importa (via require-session → session → @/modules/auth/auth)
// a instância NextAuth(), que exige 'next/server' — indisponível/quebrado no
// ambiente node do vitest (mesmo padrão de tests/unit/auth-actions-zod.test.ts).
// Este arquivo só exercita o helper puro `toggleChecklistLine` e os gatilhos de
// notificação (que não passam por sessão), então o mock abaixo evita a
// inicialização do NextAuth sem afetar nada que os testes realmente cobrem.
vi.mock('@/modules/auth/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));

import { toggleChecklistLine } from '@/actions/tasks.actions';
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

  it('notifyTaskEmRevisao: org SEM analista → não lança e não chama notify (destinatário null)', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);

    const { notifyTaskEmRevisao } = await import('@/modules/tasks/task-notifications');
    await expect(
      notifyTaskEmRevisao(orgSemAnalistaId, 'tarefa-fake-2', 'Revisar catálogo'),
    ).resolves.toBeUndefined();
    expect(notifySpy).not.toHaveBeenCalled();

    notifySpy.mockRestore();
  });

  it('notifyTaskEmRevisao: org com analista → notify chamado com href do analista', async () => {
    const notificationRepo = await import('@/modules/notifications/notification.repository');
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue(undefined);

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

    notifySpy.mockRestore();
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
