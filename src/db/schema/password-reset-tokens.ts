import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** sha256 hex do token em claro — o token NUNCA é persistido em claro. */
    token_hash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expira_em: timestamp('expira_em', { withTimezone: true, mode: 'date' }).notNull(),
    usado_em: timestamp('usado_em', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    user_idx: index('password_reset_tokens_user_idx').on(t.user_id),
  }),
);

export type PasswordResetTokenRecord = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRecord = typeof passwordResetTokens.$inferInsert;
