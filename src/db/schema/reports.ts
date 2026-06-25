import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    periodo_inicio: timestamp('periodo_inicio', { withTimezone: true, mode: 'date' }).notNull(),
    periodo_fim: timestamp('periodo_fim', { withTimezone: true, mode: 'date' }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('queued'),
    metricas: jsonb('metricas'),
    analise_ia: jsonb('analise_ia'),
    erro: text('erro'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_created_idx: index('reports_org_created_idx').on(t.org_id, t.created_at),
  }),
);

export type ReportRecord = typeof reports.$inferSelect;
export type NewReportRecord = typeof reports.$inferInsert;
