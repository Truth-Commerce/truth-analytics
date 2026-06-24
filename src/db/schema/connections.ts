import {
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    provider: varchar('provider', { length: 32 }).notNull().default('bling'),
    access_token: text('access_token'),
    refresh_token: text('refresh_token'),
    expira_em: timestamp('expira_em', { withTimezone: true, mode: 'date' }),
    status: varchar('status', { length: 16 }).notNull().default('erro'),
    last_sync_at: timestamp('last_sync_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_provider_uq: unique('connections_org_provider_uq').on(t.org_id, t.provider),
  }),
);

export type ConnectionRecord = typeof connections.$inferSelect;
export type NewConnectionRecord = typeof connections.$inferInsert;
