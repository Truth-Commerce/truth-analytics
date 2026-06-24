import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const trackedProducts = pgTable(
  'tracked_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    nome: varchar('nome', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 120 }),
    keywords: varchar('keywords', { length: 120 })
      .array()
      .notNull()
      .default([]),
    ativo: boolean('ativo').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_idx: index('tracked_products_org_idx').on(t.org_id),
  }),
);

export type TrackedProductRecord = typeof trackedProducts.$inferSelect;
export type NewTrackedProductRecord = typeof trackedProducts.$inferInsert;
