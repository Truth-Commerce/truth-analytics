import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Mesmo padrão de tests/integration/tasks-actions-edicao.test.ts: tasks.actions
// resolve sessão via requireSession() direto (não `auth()` do NextAuth, que
// não funciona no ambiente node do vitest) e o guard de impersonação lê
// cookies() de next/headers (indisponível fora de um request real do Next).
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
import { notifications, organizations, taskActivities, taskComments, taskWatchers, tasks, users } from '@/db/schema';
import {
  addCommentAction,
  followTaskFormAction,
  moveTaskFormAction,
  setTaskLabelsFormAction,
  unfollowTaskFormAction,
} from '@/actions/tasks.actions';
import { assinarImpersonation, IMPERSONATION_COOKIE } from '@/modules/auth/impersonation';
import { countUnread, listNotifications } from '@/modules/notifications/notification.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-crm-';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe.skipIf(!url)('H5/T5 — labels/watchers/menções via actions (integração)', () => {
  let orgId = '';
  let orgOutroId = '';
  let adminId = '';
  let clienteId = ''; // getOrgPrimaryUser(orgId) — único role='client' desta org
  let mencionadoId = ''; // handle "@mencionado"
  let taskId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [orgOutro] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}outro-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgOutroId = orgOutro!.id;

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

    const [mencionado] = await db
      .insert(users)
      .values({ org_id: orgId, email: `mencionado@${PREFIX}${RUN}.example.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    mencionadoId = mencionado!.id;

    const [t] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task-${RUN}`, criado_por: 'analista', prioridade: 'media' })
      .returning({ id: tasks.id });
    taskId = t!.id;
  });

  afterAll(async () => {
    const orgIds = [orgId, orgOutroId];
    const taskRows = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, orgIds));
    const taskIds = taskRows.map((r) => r.id);
    if (taskIds.length > 0) {
      await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
      await db.delete(taskWatchers).where(inArray(taskWatchers.task_id, taskIds));
      await db.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
    }
    const userRows = await db.select({ id: users.id }).from(users).where(inArray(users.org_id, orgIds));
    const userIds = userRows.map((u) => u.id);
    if (userIds.length > 0) await db.delete(notifications).where(inArray(notifications.user_id, userIds));
    await db.delete(tasks).where(inArray(tasks.org_id, orgIds));
    await db.delete(users).where(inArray(users.org_id, orgIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  });

  afterEach(() => {
    cookieStore.clear();
  });

  // ---------------------------------------------------------------------
  // setTaskLabelsFormAction
  // ---------------------------------------------------------------------
  describe('setTaskLabelsFormAction', () => {
    it('admin define labels; setTaskLabels normaliza (trim/dedup) antes de gravar', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };

      await setTaskLabelsFormAction(form({ orgId, taskId, labels: JSON.stringify(['  Promo  ', 'promo']) }));

      const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(t!.labels).toEqual(['Promo']);
    });

    it('orgId de outra org sobre a mesma task é ignorado (task_nao_encontrada, best-effort — sem 500)', async () => {
      sessaoMock.access = { id: adminId, orgId: orgOutroId, role: 'admin_truth', orgStatus: 'active', plano: null };

      await expect(
        setTaskLabelsFormAction(form({ orgId: orgOutroId, taskId, labels: JSON.stringify(['Hackeada']) })),
      ).resolves.toBeUndefined();

      const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(t!.labels).toEqual(['Promo']); // intacta — não vazou pra outra org
    });

    it('JSON inválido no campo labels é ignorado (best-effort, sem lançar)', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };

      await expect(setTaskLabelsFormAction(form({ orgId, taskId, labels: '{not json' }))).resolves.toBeUndefined();

      const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(t!.labels).toEqual(['Promo']);
    });

    it('impersonação bloqueia setTaskLabelsFormAction (lança) e a task fica intacta', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgId, adminId, new Date()));

      await expect(
        setTaskLabelsFormAction(form({ orgId, taskId, labels: JSON.stringify(['Hackeada']) })),
      ).rejects.toThrow('Modo visualização: ações desabilitadas');

      const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(t!.labels).toEqual(['Promo']); // não mudou
    });
  });

  // ---------------------------------------------------------------------
  // followTaskFormAction / unfollowTaskFormAction
  // ---------------------------------------------------------------------
  describe('followTaskFormAction / unfollowTaskFormAction', () => {
    it('cliente segue e depois deixa de seguir a própria task (nunca em nome de outro usuário)', async () => {
      sessaoMock.access = { id: clienteId, orgId, role: 'client', orgStatus: 'active', plano: 'monthly' };

      await followTaskFormAction(form({ taskId }));
      let watchers = await db.select().from(taskWatchers).where(eq(taskWatchers.task_id, taskId));
      expect(watchers.map((w) => w.user_id)).toContain(clienteId);

      await unfollowTaskFormAction(form({ taskId }));
      watchers = await db.select().from(taskWatchers).where(eq(taskWatchers.task_id, taskId));
      expect(watchers.map((w) => w.user_id)).not.toContain(clienteId);
    });

    it('impersonação bloqueia followTaskFormAction (lança): nenhum watcher gravado para o admin', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      cookieStore.set(IMPERSONATION_COOKIE, assinarImpersonation(orgId, adminId, new Date()));

      await expect(followTaskFormAction(form({ taskId, orgId }))).rejects.toThrow(
        'Modo visualização: ações desabilitadas',
      );

      const watchers = await db
        .select()
        .from(taskWatchers)
        .where(and(eq(taskWatchers.task_id, taskId), eq(taskWatchers.user_id, adminId)));
      expect(watchers).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // addCommentAction — wiring de notificarMencoes/notificarWatchers (H5/T5)
  // ---------------------------------------------------------------------
  describe('addCommentAction dispara notificarMencoes e notificarWatchers', () => {
    it('comentário com @handle notifica o usuário mencionado (best-effort, action não lança)', async () => {
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };

      const antes = await countUnread(mencionadoId);

      const r = await addCommentAction({}, form({ taskId, orgId, corpo: 'Oi @mencionado, confirma?' }));
      expect(r.ok).toBe(true);

      expect(await countUnread(mencionadoId)).toBe(antes + 1);
      const item = (await listNotifications(mencionadoId)).find((n) => n.tipo === 'task_mencao');
      expect(item).toBeDefined();
    });

    it('comentário notifica os watchers da task ("Novo comentário"), exceto o próprio autor', async () => {
      sessaoMock.access = { id: clienteId, orgId, role: 'client', orgStatus: 'active', plano: 'monthly' };
      await followTaskFormAction(form({ taskId })); // cliente vira watcher

      const antes = await countUnread(clienteId);

      // admin comenta (não é watcher, não é o autor observado) → cliente watcher é notificado
      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      await addCommentAction({}, form({ taskId, orgId, corpo: 'Comentário sem menção' }));

      expect(await countUnread(clienteId)).toBeGreaterThan(antes);
      const item = (await listNotifications(clienteId)).find((n) => n.tipo === 'task_watcher');
      expect(item).toBeDefined();
      expect(item!.titulo).toContain('Novo comentário');
    });
  });

  // ---------------------------------------------------------------------
  // Mudança de status também dispara notificarWatchers (H5/T5)
  // ---------------------------------------------------------------------
  describe('moveTaskFormAction dispara notificarWatchers com o evento de status', () => {
    it('watcher (não-autor da mudança) é notificado com "Status alterado para A fazer"', async () => {
      // cliente já é watcher (describe anterior); segue sendo.
      const antes = await countUnread(clienteId);

      sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active', plano: null };
      await moveTaskFormAction(form({ taskId, orgId, para: 'todo' }));

      expect(await countUnread(clienteId)).toBeGreaterThan(antes);
      const item = (await listNotifications(clienteId)).find(
        (n) => n.tipo === 'task_watcher' && n.titulo.includes('A fazer'),
      );
      expect(item).toBeDefined();
    });
  });
});
