import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id'),
    user_id: uuid('user_id'),
    acao: varchar('acao', { length: 128 }).notNull(),
    detalhes: jsonb('detalhes'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_created_idx: index('audit_log_org_created_idx').on(t.org_id, t.created_at),
  }),
);

export type AuditLogRecord = typeof auditLog.$inferSelect;
export type NewAuditLogRecord = typeof auditLog.$inferInsert;
