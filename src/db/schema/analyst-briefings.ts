import { index, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { reports } from './reports';

/** Pauta do analista (briefing IA) — conteúdo de leitura, 1 linha por geração. */
export const analystBriefings = pgTable(
  'analyst_briefings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    report_id: uuid('report_id')
      .notNull()
      .references(() => reports.id),
    payload: jsonb('payload').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_created_idx: index('analyst_briefings_org_created_idx').on(t.org_id, t.created_at),
  }),
);

export type AnalystBriefingRecord = typeof analystBriefings.$inferSelect;
export type NewAnalystBriefingRecord = typeof analystBriefings.$inferInsert;
