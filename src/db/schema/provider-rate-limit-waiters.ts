import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const providerRateLimitWaiters = pgTable('provider_rate_limit_waiters', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  account_fingerprint: varchar('account_fingerprint', { length: 64 }).notNull(),
  priority: varchar('priority', { length: 16 }).notNull(),
  enqueued_at: timestamp('enqueued_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  granted_at: timestamp('granted_at', { withTimezone: true, mode: 'date' }),
  cancelled_at: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
}, (t) => ({ queue: index('provider_rate_limit_waiters_queue_idx').on(t.provider, t.account_fingerprint, t.priority, t.enqueued_at, t.id) }));
