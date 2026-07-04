import { date, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { reports } from './reports';
import { users } from './users';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    descricao: text('descricao').notNull().default(''),
    tipo: varchar('tipo', { length: 16 }).notNull().default('outro'),
    prioridade: varchar('prioridade', { length: 8 }).notNull().default('media'),
    status: varchar('status', { length: 16 }).notNull().default('backlog'),
    prazo: date('prazo', { mode: 'string' }),
    criado_por: varchar('criado_por', { length: 8 }).notNull(),
    report_id: uuid('report_id').references(() => reports.id),
    assignee_user_id: uuid('assignee_user_id').references(() => users.id),
    ordem: integer('ordem').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_status_idx: index('tasks_org_status_idx').on(t.org_id, t.status),
    report_idx: index('tasks_report_idx').on(t.report_id),
  }),
);

export type TaskRecord = typeof tasks.$inferSelect;
export type NewTaskRecord = typeof tasks.$inferInsert;
