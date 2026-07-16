import { and, eq, isNotNull, lte, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks } from '@/db/schema';
import { logger } from '@/lib/logger';
import { hojeBrt } from '@/lib/timezone';
import { sendLembretePrazoEmail } from '@/modules/notifications/email';
import { notify } from '@/modules/notifications/notification.repository';
import {
  getAdminAlertEmail,
  getOrgAnalistaUser,
  getOrgPrimaryUser,
} from '@/modules/notifications/recipients';

import { labelPrazo, somarDias, statusPrazo, VENCE_EM_BREVE_DIAS } from './sla';

export const LEMBRETE_ANTECEDENCIA_DIAS = VENCE_EM_BREVE_DIAS;

export type TipoLembrete = 'vence_em_breve' | 'atrasada';
export type TaskParaLembrete = {
  taskId: string;
  orgId: string;
  titulo: string;
  prazo: string;
  tipo: TipoLembrete;
};

/** Pura: mapeia statusPrazo → tipo de lembrete (no_prazo/sem_prazo → null). */
export function classificarLembrete(prazo: string, hoje: string): TipoLembrete | null {
  const s = statusPrazo(prazo, hoje);
  return s === 'atrasada' || s === 'vence_em_breve' ? s : null;
}

/** Tasks candidatas a lembrete: org active, não concluídas, prazo ≤ hoje+2 (global — loop do cron). */
export async function listTasksParaLembrete(hoje: string): Promise<TaskParaLembrete[]> {
  const rows = await db
    .select({ taskId: tasks.id, orgId: tasks.org_id, titulo: tasks.titulo, prazo: tasks.prazo })
    .from(tasks)
    .innerJoin(organizations, eq(tasks.org_id, organizations.id))
    .where(
      and(
        eq(organizations.status, 'active'),
        ne(tasks.status, 'concluida'),
        isNotNull(tasks.prazo),
        lte(tasks.prazo, somarDias(hoje, LEMBRETE_ANTECEDENCIA_DIAS)),
      ),
    );
  return rows.flatMap((r) => {
    const tipo = r.prazo ? classificarLembrete(r.prazo, hoje) : null;
    return tipo ? [{ taskId: r.taskId, orgId: r.orgId, titulo: r.titulo, prazo: r.prazo!, tipo }] : [];
  });
}

/** Dedup: já existe activity lembrete_prazo com o MESMO tipo e o MESMO prazo? */
export async function jaLembrada(taskId: string, tipo: TipoLembrete, prazo: string): Promise<boolean> {
  const [row] = await db
    .select({ id: taskActivities.id })
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.task_id, taskId),
        eq(taskActivities.evento, 'lembrete_prazo'),
        eq(taskActivities.para, tipo),
        eq(taskActivities.de, prazo),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Cobra prazos: vence em ≤2d → notifica o cliente; venceu → cliente +
 * analista. Dedup por (task, tipo, prazo) em task_activities — sem tabela
 * nova; `notifications` não tem dedup (decisão documentada no plano G3).
 * Best-effort por task; devolve o nº de lembretes enviados.
 */
export async function processarLembretesDePrazo(agora: Date = new Date()): Promise<number> {
  const hoje = hojeBrt(agora);
  const candidatas = await listTasksParaLembrete(hoje);
  let enviados = 0;
  for (const t of candidatas) {
    try {
      if (await jaLembrada(t.taskId, t.tipo, t.prazo)) continue;
      const prazoLabel = labelPrazo(t.prazo, hoje) ?? t.prazo;
      const tituloNotif = t.tipo === 'atrasada' ? 'Tarefa atrasada' : 'Tarefa perto do prazo';

      const cliente = await getOrgPrimaryUser(t.orgId);
      if (cliente) {
        await notify(cliente.id, {
          tipo: `lembrete_${t.tipo}`,
          titulo: tituloNotif,
          corpo: `${t.titulo} — ${prazoLabel}`,
          href: `/dashboard/plano-de-acao/${t.taskId}`,
        });
        await sendLembretePrazoEmail(cliente.email, { titulo: t.titulo, prazoLabel, tipo: t.tipo });
      }
      if (t.tipo === 'atrasada') {
        const analista = await getOrgAnalistaUser(t.orgId);
        if (analista) {
          await notify(analista.id, {
            tipo: 'lembrete_atrasada',
            titulo: 'Tarefa atrasada na sua carteira',
            corpo: `${t.titulo} — ${prazoLabel}`,
            href: `/analista/${t.orgId}/tasks/${t.taskId}`,
          });
          await sendLembretePrazoEmail(analista.email, { titulo: t.titulo, prazoLabel, tipo: t.tipo });
        } else {
          // Org sem analista: fallback de e-mail ao admin (Task 10 — G3);
          // sem in-app (não há user determinístico). Env ausente → descarta.
          const adminEmail = getAdminAlertEmail();
          if (adminEmail) {
            await sendLembretePrazoEmail(adminEmail, { titulo: t.titulo, prazoLabel, tipo: t.tipo });
          }
        }
      }
      // Ledger de dedup — só grava se notificou (ou tentou) sem lançar.
      await db.insert(taskActivities).values({
        task_id: t.taskId,
        user_id: null,
        evento: 'lembrete_prazo',
        de: t.prazo,
        para: t.tipo,
      });
      enviados += 1;
    } catch (err) {
      logger.warn('lembrete de prazo falhou', { taskId: t.taskId }, err);
    }
  }
  return enviados;
}
