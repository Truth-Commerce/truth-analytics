import { index, integer, jsonb, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

/** Estado retomável e lease de sincronização por recurso de cada ERP. */
export const connectionSyncState = pgTable(
  'connection_sync_state',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    provider: varchar('provider', { length: 32 }).notNull(),
    resource: varchar('resource', { length: 64 }).notNull(),
    cursor: jsonb('cursor'),
    run_id: uuid('run_id'),
    lease_token: varchar('lease_token', { length: 128 }),
    lease_expires_at: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    started_at: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    succeeded_at: timestamp('succeeded_at', { withTimezone: true, mode: 'date' }),
    failed_at: timestamp('failed_at', { withTimezone: true, mode: 'date' }),
    processed_count: integer('processed_count').notNull().default(0),
    backlog_count: integer('backlog_count'),
    last_error_code: varchar('last_error_code', { length: 64 }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_provider_resource_uq: unique('connection_sync_state_org_provider_resource_uq').on(
      t.org_id,
      t.provider,
      t.resource,
    ),
    lease_expires_idx: index('connection_sync_state_lease_expires_idx').on(t.lease_expires_at),
  }),
);

export type ConnectionSyncStateRecord = typeof connectionSyncState.$inferSelect;
export type NewConnectionSyncStateRecord = typeof connectionSyncState.$inferInsert;
