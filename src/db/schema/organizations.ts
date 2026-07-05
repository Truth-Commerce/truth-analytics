import {
  type AnyPgColumn,
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './users';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  plano: varchar('plano', { length: 16 }),
  nicho: text('nicho'),
  analista_id: uuid('analista_id').references((): AnyPgColumn => users.id),
  proximo_relatorio_liberado_em: timestamp('proximo_relatorio_liberado_em', {
    withTimezone: true,
    mode: 'date',
  }),
  geracao_automatica: boolean('geracao_automatica').notNull().default(true),
  meta_mensal: numeric('meta_mensal', { precision: 12, scale: 2 }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export type OrganizationRecord = typeof organizations.$inferSelect;
export type NewOrganizationRecord = typeof organizations.$inferInsert;
