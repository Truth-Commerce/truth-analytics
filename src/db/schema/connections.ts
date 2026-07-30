import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
    provider_account_fingerprint: varchar('provider_account_fingerprint', { length: 64 }),
    data_generation: integer('data_generation').notNull().default(1),
    access_token: text('access_token'),
    refresh_token: text('refresh_token'),
    expira_em: timestamp('expira_em', { withTimezone: true, mode: 'date' }),
    oauth_client_id: text('oauth_client_id'),
    oauth_client_secret: text('oauth_client_secret'),
    refresh_expira_em: timestamp('refresh_expira_em', { withTimezone: true, mode: 'date' }),
    last_refresh_at: timestamp('last_refresh_at', { withTimezone: true, mode: 'date' }),
    last_error_code: varchar('last_error_code', { length: 64 }),
    last_error_at: timestamp('last_error_at', { withTimezone: true, mode: 'date' }),
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
    org_erp_ok_uq: uniqueIndex('connections_org_erp_ok_uq')
      .on(t.org_id)
      .where(sql`${t.status} = 'ok'`),
    status_check: check(
      'connections_status_check',
      sql`${t.status} IN ('ok', 'expirado', 'erro', 'configurado')`,
    ),
  }),
);

export type ConnectionRecord = typeof connections.$inferSelect;
export type NewConnectionRecord = typeof connections.$inferInsert;
