import { boolean, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Heartbeat de crons (global, sem org_id) — 1 linha por rota, upsert a cada
 * execução. Serve o painel de operações (Task 9 do H4). Não entra no purge de
 * org: não pertence a nenhum cliente.
 */
export const cronHeartbeats = pgTable('cron_heartbeats', {
  rota: varchar('rota', { length: 64 }).primaryKey(),
  executado_em: timestamp('executado_em', { withTimezone: true, mode: 'date' }).notNull(),
  ok: boolean('ok').notNull().default(true),
  detalhes: jsonb('detalhes').notNull().default({}),
});

export type CronHeartbeatRecord = typeof cronHeartbeats.$inferSelect;
export type NewCronHeartbeatRecord = typeof cronHeartbeats.$inferInsert;
