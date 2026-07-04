import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { notifications, organizations, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-notif-';

describe.skipIf(!url)('notification.repository — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  let orgAId = '';
  let orgBId = '';
  let userAId = '';
  let userBId = '';

  beforeAll(async () => {
    const [orgA] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}org-a-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;

    const [orgB] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}org-b-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;

    const [userA] = await tdb
      .insert(users)
      .values({ org_id: orgAId, email: `${PREFIX}a-${RUN}@example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userAId = userA!.id;

    const [userB] = await tdb
      .insert(users)
      .values({ org_id: orgBId, email: `${PREFIX}b-${RUN}@example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userBId = userB!.id;
  });

  afterAll(async () => {
    try {
      await tdb.delete(notifications).where(eq(notifications.user_id, userAId));
      await tdb.delete(notifications).where(eq(notifications.user_id, userBId));
      await tdb.delete(users).where(eq(users.org_id, orgAId));
      await tdb.delete(users).where(eq(users.org_id, orgBId));
      await tdb.delete(organizations).where(eq(organizations.id, orgAId));
      await tdb.delete(organizations).where(eq(organizations.id, orgBId));
    } finally {
      await sql.end();
    }
  });

  it('notify(u1) insere notificação e countUnread(u1) === 1, countUnread(u2) === 0 (escopo)', async () => {
    const { notify, countUnread } = await import('@/modules/notifications/notification.repository');

    await notify(userAId, { tipo: 'task_criada', titulo: 'Tarefa X', corpo: 'corpo', href: '/tasks/1' });

    const unreadA = await countUnread(userAId);
    const unreadB = await countUnread(userBId);
    expect(unreadA).toBe(1);
    expect(unreadB).toBe(0);
  });

  it('listNotifications(u1) traz a notificação com lida:false', async () => {
    const { listNotifications } = await import('@/modules/notifications/notification.repository');

    const lista = await listNotifications(userAId);
    expect(lista.length).toBeGreaterThanOrEqual(1);
    const item = lista.find((n) => n.titulo === 'Tarefa X');
    expect(item).toBeDefined();
    expect(item!.lida).toBe(false);
    expect(item!.tipo).toBe('task_criada');
    expect(item!.href).toBe('/tasks/1');
    expect(item!.createdAt).toBeInstanceOf(Date);
  });

  it('markRead(u2, idDeU1) não marca (escopo); markRead(u1, id) marca', async () => {
    const { listNotifications, markRead, countUnread } = await import(
      '@/modules/notifications/notification.repository'
    );

    const lista = await listNotifications(userAId);
    const notifId = lista.find((n) => n.titulo === 'Tarefa X')!.id;

    await markRead(userBId, notifId);
    const listaAposTentativaIndevida = await listNotifications(userAId);
    const aindaNaoLida = listaAposTentativaIndevida.find((n) => n.id === notifId);
    expect(aindaNaoLida!.lida).toBe(false);
    expect(await countUnread(userAId)).toBe(1);

    await markRead(userAId, notifId);
    const listaAposMarcar = await listNotifications(userAId);
    const agoraLida = listaAposMarcar.find((n) => n.id === notifId);
    expect(agoraLida!.lida).toBe(true);
    expect(await countUnread(userAId)).toBe(0);
  });

  it('markAllRead(u1) zera countUnread', async () => {
    const { notify, markAllRead, countUnread } = await import('@/modules/notifications/notification.repository');

    await notify(userAId, { tipo: 'task_comentario', titulo: 'Outra', corpo: 'corpo2' });
    await notify(userAId, { tipo: 'task_devolvida', titulo: 'Mais uma', corpo: 'corpo3' });
    expect(await countUnread(userAId)).toBe(2);

    await markAllRead(userAId);
    expect(await countUnread(userAId)).toBe(0);
  });

  it('notify com userId inexistente não lança (FK falha é engolida)', async () => {
    const { notify } = await import('@/modules/notifications/notification.repository');

    await expect(
      notify('00000000-0000-0000-0000-000000000000', { tipo: 'task_criada', titulo: 'x', corpo: 'y' }),
    ).resolves.toBeUndefined();
  });
});
