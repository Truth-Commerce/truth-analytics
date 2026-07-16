import { index, numeric, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

/** Snapshot do saldo de estoque por produto (sync diário do Bling). */
export const productStock = pgTable(
  'product_stock',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    sku: varchar('sku', { length: 64 }).notNull(),
    nome: varchar('nome', { length: 255 }).notNull(),
    saldo: numeric('saldo', { precision: 12, scale: 2 }).notNull().default('0'),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_sku_uq: unique('product_stock_org_sku_uq').on(t.org_id, t.sku),
    org_idx: index('product_stock_org_idx').on(t.org_id),
  }),
);

export type ProductStockRecord = typeof productStock.$inferSelect;
export type NewProductStockRecord = typeof productStock.$inferInsert;
