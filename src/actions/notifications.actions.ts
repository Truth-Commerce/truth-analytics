'use server';

import { requireSession } from '@/modules/auth/require-session';
import { markAllRead, markRead } from '@/modules/notifications/notification.repository';

/**
 * Marca uma notificação como lida. Escopada pelo usuário da sessão.
 * Sem revalidatePath: o sino de notificações refaz o fetch via polling.
 */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const access = await requireSession();
  const notificationId = String(formData.get('notificationId') ?? '');
  if (!notificationId) return;
  await markRead(access.id, notificationId);
}

/**
 * Marca todas as notificações do usuário da sessão como lidas.
 * Sem revalidatePath: o sino de notificações refaz o fetch via polling.
 */
export async function markAllNotificationsReadAction(): Promise<void> {
  const access = await requireSession();
  await markAllRead(access.id);
}
