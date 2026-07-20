import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

/** Ciclo (sprint) de uma organização — agrupa tasks por período de execução. */
export const cycles = pgTable(
  'cycles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    nome: varchar('nome', { length: 120 }).notNull(),
    inicio: date('inicio', { mode: 'string' }),
    fim: date('fim', { mode: 'string' }),
    status: varchar('status', { length: 12 }).notNull().default('planejado'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    org_status_idx: index('cycles_org_status_idx').on(t.org_id, t.status),
    status_check: check(
      'cycles_status_check',
      sql`${t.status} IN ('planejado', 'ativo', 'fechado')`,
    ),
  }),
);

export type CycleRecord = typeof cycles.$inferSelect;
export type NewCycleRecord = typeof cycles.$inferInsert;
