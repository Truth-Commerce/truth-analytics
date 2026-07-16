import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  titulo: varchar('titulo', { length: 200 }).notNull(),
  tipo: varchar('tipo', { length: 16 }).notNull().default('outro'),
  descricao: text('descricao').notNull().default(''),
  checklist: jsonb('checklist').notNull().default([]),
  prioridade: varchar('prioridade', { length: 8 }).notNull().default('media'),
  prazo_dias: integer('prazo_dias'),
  ativo: boolean('ativo').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export type TaskTemplateRecord = typeof taskTemplates.$inferSelect;
