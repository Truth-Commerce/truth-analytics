import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { tasks } from './tasks';
import { users } from './users';

export const taskActivities = pgTable(
  'task_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    user_id: uuid('user_id').references(() => users.id),
    evento: varchar('evento', { length: 32 }).notNull(),
    de: text('de'),
    para: text('para'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({ task_idx: index('task_activities_task_idx').on(t.task_id) }),
);

export type TaskActivityRecord = typeof taskActivities.$inferSelect;
