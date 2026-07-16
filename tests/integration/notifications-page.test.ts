import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { notifications, organizations, users } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-notifpage-';

describe.skipIf(!url)('listNotificationsPage — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);

  let orgId = '';
  let userId = '';
  let outroUserId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [user] = await tdb
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}u-${RUN}@example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;

    const [outro] = await tdb
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}o-${RUN}@example.com`, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    outroUserId = outro!.id;

    const { notify } = await import('@/modules/notifications/notification.repository');
    for (let i = 0; i < 25; i++) {
      await notify(userId, { tipo: 'task_criada', titulo: `Notif ${i}`, corpo: `corpo ${i}`, href: `/tasks/${i}` });
    }
  });

  afterAll(async () => {
    try {
      await tdb.delete(notifications).where(eq(notifications.user_id, userId));
      await tdb.delete(notifications).where(eq(notifications.user_id, outroUserId));
      await tdb.delete(users).where(eq(users.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      await sql.end();
    }
  });

  it('listNotificationsPage pagina (20 + 5) e devolve total', async () => {
    const { listNotificationsPage } = await import('@/modules/notifications/notification.repository');
    const p1 = await listNotificationsPage(userId, 1);
    expect(p1.items).toHaveLength(20);
    expect(p1.total).toBe(25);
    const p2 = await listNotificationsPage(userId, 2);
    expect(p2.items).toHaveLength(5);
    // escopo: outro user não vê
    const outra = await listNotificationsPage(outroUserId, 1);
    expect(outra.total).toBe(0);
  });

  it('ordena mais recentes primeiro e trata página inválida (<1) como 1', async () => {
    const { listNotificationsPage } = await import('@/modules/notifications/notification.repository');
    const p1 = await listNotificationsPage(userId, 1);
    const invalida = await listNotificationsPage(userId, 0);
    expect(invalida.items[0]!.id).toBe(p1.items[0]!.id);
    // a mais recente é a última criada no loop (Notif 24)
    expect(p1.items[0]!.titulo).toBe('Notif 24');
  });
});
