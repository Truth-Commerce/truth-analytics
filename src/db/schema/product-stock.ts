import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

/** Snapshot do saldo de estoque por produto (sync diário do Bling). */
export const productStock = pgTable(
  'product_stock',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    provider: varchar('provider', { length: 32 }).notNull().default('bling'),
    source_generation: integer('source_generation').notNull().default(1),
    fencing_version: bigint('fencing_version', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    provider_product_id: varchar('provider_product_id', { length: 64 }),
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
    org_provider_sku_uq: unique('product_stock_org_provider_sku_uq').on(
      t.org_id,
      t.provider,
      t.sku,
    ),
    org_provider_generation_sku_uq: unique(
      'product_stock_org_provider_generation_sku_uq',
    ).on(t.org_id, t.provider, t.source_generation, t.sku),
    org_provider_generation_updated_idx: index(
      'product_stock_org_provider_generation_updated_idx',
    ).on(t.org_id, t.provider, t.source_generation, t.updated_at),
    org_idx: index('product_stock_org_idx').on(t.org_id),
  }),
);

export type ProductStockRecord = typeof productStock.$inferSelect;
export type NewProductStockRecord = typeof productStock.$inferInsert;
