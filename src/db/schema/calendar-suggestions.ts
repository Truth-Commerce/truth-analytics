import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { reports } from './reports';
import { tasks } from './tasks';

/** Sugestão sazonal do calendário comercial (1 linha por sugestão). */
export const calendarSuggestions = pgTable(
  'calendar_suggestions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    report_id: uuid('report_id')
      .notNull()
      .references(() => reports.id),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: varchar('status', { length: 16 }).notNull().default('sugerido'),
    task_id: uuid('task_id').references(() => tasks.id),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_report_idx: index('calendar_suggestions_org_report_idx').on(t.org_id, t.report_id),
    org_status_idx: index('calendar_suggestions_org_status_idx').on(t.org_id, t.status),
    status_check: check(
      'calendar_suggestions_status_check',
      sql`${t.status} IN ('sugerido', 'virou_task', 'descartado')`,
    ),
  }),
);

export type CalendarSuggestionRecord = typeof calendarSuggestions.$inferSelect;
export type NewCalendarSuggestionRecord = typeof calendarSuggestions.$inferInsert;
