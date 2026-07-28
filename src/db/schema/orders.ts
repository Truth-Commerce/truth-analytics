import { sql } from 'drizzle-orm';
import {
  index,
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
    provider: varchar('provider', { length: 32 }).notNull().default('bling'),
    // The database trigger keeps legacy Bling inserts compatible while new providers send this explicitly.
    provider_order_id: varchar('provider_order_id', { length: 64 }).notNull().default(''),
    canal: varchar('canal', { length: 32 }).notNull(),
    data: timestamp('data', { withTimezone: true, mode: 'date' }).notNull(),
    valor_total: numeric('valor_total', { precision: 12, scale: 2 }).notNull(),
    frete: numeric('frete', { precision: 12, scale: 2 }).notNull().default('0'),
    /** Retido pelo marketplace (taxas.taxaComissao do detalhe). Só vem no detalhe. */
    comissao: numeric('comissao', { precision: 12, scale: 2 }).notNull().default('0'),
    itens: jsonb('itens').notNull().default([]),
    /**
     * Quando o detalhe (/pedidos/vendas/{id}) foi lido com sucesso. NULL = a linha
     * só tem o que a listagem entrega — sem itens, sem frete, sem comissão.
     * É o marcador da fila de enriquecimento; `itens = []` não serve, porque um
     * pedido pode legitimamente vir sem item e reentraria na fila para sempre.
     */
    enriquecido_em: timestamp('enriquecido_em', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_bling_uq: unique('orders_org_bling_uq').on(t.org_id, t.bling_order_id),
    org_provider_order_uq: unique('orders_org_provider_order_uq').on(
      t.org_id,
      t.provider,
      t.provider_order_id,
    ),
    org_data_idx: index('orders_org_data_idx').on(t.org_id, t.data),
    // Fila de enriquecimento: pedidos ainda não detalhados, mais recentes primeiro.
    org_pendente_idx: index('orders_org_pendente_idx')
      .on(t.org_id, t.data)
      .where(sql`${t.enriquecido_em} is null`),
  }),
);

export type OrderRecord = typeof orders.$inferSelect;
export type NewOrderRecord = typeof orders.$inferInsert;
