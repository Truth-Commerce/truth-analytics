import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { reports } from './reports';
import { tasks } from './tasks';

/** Sugestão de kit gerada por ciclo (1 linha por kit; payload = composição completa). */
export const kitSuggestions = pgTable(
  'kit_suggestions',
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
    org_report_idx: index('kit_suggestions_org_report_idx').on(t.org_id, t.report_id),
    org_status_idx: index('kit_suggestions_org_status_idx').on(t.org_id, t.status),
    status_check: check(
      'kit_suggestions_status_check',
      sql`${t.status} IN ('sugerido', 'virou_task', 'descartado')`,
    ),
  }),
);

export type KitSuggestionRecord = typeof kitSuggestions.$inferSelect;
export type NewKitSuggestionRecord = typeof kitSuggestions.$inferInsert;
