import {
  jsonb,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    bling_order_id: varchar('bling_order_id', { length: 64 }).notNull(),
    canal: varchar('canal', { length: 32 }).notNull(),
    data: timestamp('data', { withTimezone: true, mode: 'date' }).notNull(),
    valor_total: numeric('valor_total', { precision: 12, scale: 2 }).notNull(),
    frete: numeric('frete', { precision: 12, scale: 2 }).notNull().default('0'),
    itens: jsonb('itens').notNull().default([]),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_bling_uq: unique('orders_org_bling_uq').on(t.org_id, t.bling_order_id),
  }),
);

export type OrderRecord = typeof orders.$inferSelect;
export type NewOrderRecord = typeof orders.$inferInsert;
