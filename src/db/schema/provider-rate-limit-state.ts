import { integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/** Estado compartilhado de limite de requisições por conta do provider. */
export const providerRateLimitState = pgTable(
  'provider_rate_limit_state',
  {
    provider: varchar('provider', { length: 32 }).notNull(),
    account_fingerprint: varchar('account_fingerprint', { length: 64 }).notNull(),
    next_request_at: timestamp('next_request_at', { withTimezone: true, mode: 'date' }),
    window_started_at: timestamp('window_started_at', { withTimezone: true, mode: 'date' }),
    requests_in_window: integer('requests_in_window').notNull().default(0),
    consecutive_high_priority: integer('consecutive_high_priority').notNull().default(0),
    observed_limit: integer('observed_limit'),
    observed_remaining: integer('observed_remaining'),
    observed_reset_at: timestamp('observed_reset_at', { withTimezone: true, mode: 'date' }),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    provider_account_uq: unique('provider_rate_limit_state_provider_account_uq').on(
      t.provider,
      t.account_fingerprint,
    ),
  }),
);

export type ProviderRateLimitStateRecord = typeof providerRateLimitState.$inferSelect;
export type NewProviderRateLimitStateRecord = typeof providerRateLimitState.$inferInsert;
