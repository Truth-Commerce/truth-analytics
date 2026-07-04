import { boolean, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    success: boolean('success').notNull().default(false),
    escopo: varchar('escopo', { length: 16 }).notNull().default('login'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    email_created_idx: index('login_attempts_email_created_idx').on(t.email, t.created_at),
    ip_created_idx: index('login_attempts_ip_created_idx').on(t.ip, t.created_at),
  }),
);

export type LoginAttemptRecord = typeof loginAttempts.$inferSelect;
export type NewLoginAttemptRecord = typeof loginAttempts.$inferInsert;
