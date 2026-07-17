import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { calendarSuggestions, reports, type CalendarSuggestionRecord } from '@/db/schema';
import type { SugestaoCalendario } from '@/modules/calendario/calendario-ia';

export async function insertSugestoes(
  orgId: string,
  reportId: string,
  sugestoes: SugestaoCalendario[],
): Promise<number> {
  if (sugestoes.length === 0) return 0;
  await db.insert(calendarSuggestions).values(
    sugestoes.map((s) => ({
      org_id: orgId,
      report_id: reportId,
      titulo: s.titulo.slice(0, 200),
      payload: {
        dataISO: s.dataISO,
        nomeData: s.nomeData,
        sugestao: s.sugestao,
        skus: s.skus,
      },
    })),
  );
  return sugestoes.length;
}

/** Sugestões do ciclo mais recente que tem sugestões. Escopado por org_id. */
export async function listSugestoesUltimoCiclo(orgId: string): Promise<CalendarSuggestionRecord[]> {
  const [ultimo] = await db
    .select({ report_id: calendarSuggestions.report_id, created_at: calendarSuggestions.created_at })
    .from(calendarSuggestions)
    .where(eq(calendarSuggestions.org_id, orgId))
    .orderBy(desc(calendarSuggestions.created_at))
    .limit(1);
  if (!ultimo) return [];
  return db
    .select()
    .from(calendarSuggestions)
    .where(
      and(eq(calendarSuggestions.org_id, orgId), eq(calendarSuggestions.report_id, ultimo.report_id)),
    )
    .orderBy(desc(calendarSuggestions.created_at));
}

/** Transição única sugerido→(virou_task|descartado), escopada por org. */
export async function marcarSugestaoStatus(
  orgId: string,
  sugestaoId: string,
  status: 'virou_task' | 'descartado',
): Promise<boolean> {
  const rows = await db
    .update(calendarSuggestions)
    .set({ status })
    .where(
      and(
        eq(calendarSuggestions.id, sugestaoId),
        eq(calendarSuggestions.org_id, orgId),
        eq(calendarSuggestions.status, 'sugerido'),
      ),
    )
    .returning({ id: calendarSuggestions.id });
  return rows.length > 0;
}

/**
 * Grava o task_id na reserva já feita por marcarSugestaoStatus (sugestão já
 * está em 'virou_task' sem task_id). Escopado por org + status para nunca
 * sobrescrever uma sugestão que não seja a reserva em curso.
 */
export async function setSugestaoTaskId(
  orgId: string,
  sugestaoId: string,
  taskId: string,
): Promise<void> {
  await db
    .update(calendarSuggestions)
    .set({ task_id: taskId })
    .where(
      and(
        eq(calendarSuggestions.id, sugestaoId),
        eq(calendarSuggestions.org_id, orgId),
        eq(calendarSuggestions.status, 'virou_task'),
      ),
    );
}

/**
 * Compensa uma reserva ('virou_task' sem task_id) quando createTask falha
 * após marcarSugestaoStatus reservar a sugestão. `task_id IS NULL` garante
 * que nunca desfaz uma sugestão que já tem tarefa vinculada.
 */
export async function reverterSugestaoParaSugerida(orgId: string, sugestaoId: string): Promise<void> {
  await db
    .update(calendarSuggestions)
    .set({ status: 'sugerido' })
    .where(
      and(
        eq(calendarSuggestions.id, sugestaoId),
        eq(calendarSuggestions.org_id, orgId),
        eq(calendarSuggestions.status, 'virou_task'),
        isNull(calendarSuggestions.task_id),
      ),
    );
}

export async function setCalendarIaUsage(
  orgId: string,
  reportId: string,
  usage: unknown,
): Promise<void> {
  await db
    .update(reports)
    .set({ calendar_ia_usage: usage })
    .where(and(eq(reports.id, reportId), eq(reports.org_id, orgId)));
}
