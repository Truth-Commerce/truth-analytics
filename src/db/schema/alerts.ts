import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    tipo: varchar('tipo', { length: 32 }).notNull(),
    severidade: varchar('severidade', { length: 16 }).notNull().default('atencao'),
    titulo: varchar('titulo', { length: 255 }).notNull(),
    corpo: text('corpo').notNull(),
    dados: jsonb('dados').notNull().default({}),
    resolvido: boolean('resolvido').notNull().default(false),
    resolvido_em: timestamp('resolvido_em', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_abertos_idx: index('alerts_org_abertos_idx').on(t.org_id, t.resolvido, t.created_at),
    // Anti-corrida: no máx. 1 alerta ABERTO por (org, tipo, chave de dedup).
    // A chave vive em dados->>'chave_dedup' (gravada por criarAlertas).
    org_tipo_dedup_aberto_uq: uniqueIndex('alerts_org_tipo_dedup_aberto_uq')
      .on(t.org_id, t.tipo, sql`(${t.dados}->>'chave_dedup')`)
      .where(sql`${t.resolvido} = false`),
    tipo_check: check(
      'alerts_tipo_check',
      sql`${t.tipo} IN ('queda_vendas', 'concorrente_preco', 'produto_parado')`,
    ),
    severidade_check: check(
      'alerts_severidade_check',
      sql`${t.severidade} IN ('atencao', 'critico')`,
    ),
  }),
);

export type AlertRecord = typeof alerts.$inferSelect;
export type NewAlertRecord = typeof alerts.$inferInsert;
