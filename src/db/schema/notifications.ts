import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tipo: varchar('tipo', { length: 32 }).notNull(),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    corpo: text('corpo').notNull().default(''),
    href: varchar('href', { length: 500 }),
    lida: boolean('lida').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({ user_lida_idx: index('notifications_user_lida_idx').on(t.user_id, t.lida) }),
);

export type NotificationRecord = typeof notifications.$inferSelect;
