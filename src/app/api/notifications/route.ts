import { NextResponse } from 'next/server';

import { auth } from '@/modules/auth/auth';
import { countUnread, listNotifications } from '@/modules/notifications/notification.repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'nao_autenticado' }, { status: 401 });

  const [unread, items] = await Promise.all([countUnread(userId), listNotifications(userId, 10)]);
  return NextResponse.json({ unread, items });
}
