import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { notifications } from '@/db/schema';
import { logger } from '@/lib/logger';

export type NotifyInput = { tipo: string; titulo: string; corpo: string; href?: string };

/**
 * Cria uma notificação in-app para um usuário. API genérica reusada pela F3
 * (alertas). NUNCA lança — notificação não deve quebrar nenhum fluxo de
 * negócio (ex.: userId inexistente causa falha de FK, que é engolida e logada).
 */
export async function notify(userId: string, input: NotifyInput): Promise<void> {
  try {
    await db.insert(notifications).values({
      user_id: userId,
      tipo: input.tipo,
      titulo: input.titulo,
      corpo: input.corpo,
      href: input.href ?? null,
    });
  } catch (e) {
    logger.warn('notify falhou', { userId, tipo: input.tipo, erro: e instanceof Error ? e.message : String(e) });
  }
}

export async function listNotifications(userId: string, limit = 10) {
  return db
    .select({
      id: notifications.id,
      tipo: notifications.tipo,
      titulo: notifications.titulo,
      corpo: notifications.corpo,
      href: notifications.href,
      lida: notifications.lida,
      createdAt: notifications.created_at,
    })
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
    .limit(limit);
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), eq(notifications.lida, false)));
  return Number(row?.n ?? 0);
}

/**
 * Marca uma notificação como lida. Escopada por userId — nunca marca
 * notificação de outro usuário mesmo que o id exista.
 */
export async function markRead(userId: string, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ lida: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
}

export async function markAllRead(userId: string): Promise<void> {
  await db.update(notifications).set({ lida: true }).where(eq(notifications.user_id, userId));
}
