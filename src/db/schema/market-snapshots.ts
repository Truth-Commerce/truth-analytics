import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { reports } from './reports';

export const marketSnapshots = pgTable(
  'market_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    report_id: uuid('report_id')
      .notNull()
      .references(() => reports.id),
    fonte: varchar('fonte', { length: 32 }).notNull(),
    keyword: varchar('keyword', { length: 160 }).notNull(),
    dados: jsonb('dados').notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    report_idx: index('market_snapshots_report_idx').on(t.report_id),
  }),
);

export type MarketSnapshotRecord = typeof marketSnapshots.$inferSelect;
export type NewMarketSnapshotRecord = typeof marketSnapshots.$inferInsert;
