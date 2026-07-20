import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
    etapa: varchar('etapa', { length: 32 }),
    metricas: jsonb('metricas'),
    analise_ia: jsonb('analise_ia'),
    /** Usage da chamada Claude { input_tokens, output_tokens, cache_*, tentativas } — governança de custo. */
    ia_usage: jsonb('ia_usage'),
    kits_ia_usage: jsonb('kits_ia_usage'),
    calendar_ia_usage: jsonb('calendar_ia_usage'),
    briefing_ia_usage: jsonb('briefing_ia_usage'),
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
    // Lock de idempotência: no máximo 1 report ativo (queued|running) por org.
    org_ativo_uq: uniqueIndex('reports_org_ativo_uq')
      .on(t.org_id)
      .where(sql`status IN ('queued', 'running')`),
  }),
);

export type ReportRecord = typeof reports.$inferSelect;
export type NewReportRecord = typeof reports.$inferInsert;
