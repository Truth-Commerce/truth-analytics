import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { tasks } from './tasks';
import { users } from './users';

/** Usuário que acompanha (observa) uma task — recebe notificações de atividade. */
export const taskWatchers = pgTable(
  'task_watchers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({
    task_user_unique: uniqueIndex('task_watchers_task_user_unique').on(t.task_id, t.user_id),
    task_idx: index('task_watchers_task_idx').on(t.task_id),
  }),
);

export type TaskWatcherRecord = typeof taskWatchers.$inferSelect;
export type NewTaskWatcherRecord = typeof taskWatchers.$inferInsert;
