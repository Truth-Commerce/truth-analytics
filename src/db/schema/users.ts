import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  senha_hash: varchar('senha_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 32 }).notNull().default('client'),
  /** Carimbo do aceite de Termos de Uso + Política de Privacidade no signup (LGPD). Null p/ contas pré-G5. */
  aceitou_termos_em: timestamp('aceitou_termos_em', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
