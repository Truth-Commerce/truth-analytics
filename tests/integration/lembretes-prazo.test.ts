import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/client';
import { notifications, organizations, taskActivities, tasks, users } from '@/db/schema';
import { hojeBrt } from '@/lib/timezone';
import * as emailModule from '@/modules/notifications/email';
import { somarDias } from '@/modules/tasks/sla';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-lembrete-';

describe.skipIf(!url)('lembretes de prazo — cobrança no cron (integração)', () => {
  let orgId = '';
  let userId = '';
  let taskVencendoId = '';
  let taskAtrasadaId = '';
  const userEmail = `${PREFIX}${RUN}@example.com`;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: userEmail, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;

    const [vencendo] = await db
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${PREFIX}vence-amanha`,
        status: 'em_andamento',
        criado_por: 'analista',
        prazo: somarDias(hojeBrt(), 1),
      })
      .returning({ id: tasks.id });
    taskVencendoId = vencendo!.id;

    const [atrasada] = await db
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${PREFIX}atrasada`,
        status: 'em_andamento',
        criado_por: 'analista',
        prazo: '2020-01-01',
      })
      .returning({ id: tasks.id });
    taskAtrasadaId = atrasada!.id;
  });

  afterAll(async () => {
    try {
      await db.delete(notifications).where(eq(notifications.user_id, userId));
      for (const id of [taskVencendoId, taskAtrasadaId]) {
        await db.delete(taskActivities).where(eq(taskActivities.task_id, id));
      }
      await db.delete(tasks).where(eq(tasks.org_id, orgId));
      await db.delete(users).where(eq(users.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('processa lembretes: 1 por task, in-app + email, e NÃO repete na 2ª execução', async () => {
    const emailSpy = vi.spyOn(emailModule, 'sendLembretePrazoEmail').mockResolvedValue();
    try {
      const { processarLembretesDePrazo } = await import('@/modules/tasks/lembretes-prazo');
      const n1 = await processarLembretesDePrazo();
      // as 2 tasks desta suíte lembradas (pode haver tasks de outras suítes —
      // asserta pelo notifications DESTE user).
      expect(n1).toBeGreaterThanOrEqual(2);

      const notifs = await db.select().from(notifications).where(eq(notifications.user_id, userId));
      const tipos = notifs.map((n) => n.tipo).sort();
      expect(tipos).toContain('lembrete_vence_em_breve');
      expect(tipos).toContain('lembrete_atrasada');

      // e-mail para o cliente foi disparado (best-effort, via spy)
      expect(emailSpy.mock.calls.some(([to]) => to === userEmail)).toBe(true);

      const antes = notifs.length;
      await processarLembretesDePrazo(); // 2ª execução — dedup via task_activities
      const depois = await db
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, userId));
      expect(depois.length).toBe(antes);
    } finally {
      emailSpy.mockRestore();
    }
  });

  it('prazo alterado → lembra de novo (chave de dedup inclui o prazo)', async () => {
    const emailSpy = vi.spyOn(emailModule, 'sendLembretePrazoEmail').mockResolvedValue();
    try {
      await db.update(tasks).set({ prazo: somarDias(hojeBrt(), 2) }).where(eq(tasks.id, taskVencendoId));
      const { processarLembretesDePrazo } = await import('@/modules/tasks/lembretes-prazo');
      await processarLembretesDePrazo();
      const acts = await db
        .select()
        .from(taskActivities)
        .where(and(eq(taskActivities.task_id, taskVencendoId), eq(taskActivities.evento, 'lembrete_prazo')));
      expect(acts.length).toBe(2); // um por prazo
    } finally {
      emailSpy.mockRestore();
    }
  });
});
