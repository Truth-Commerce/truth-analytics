import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tasks } from './tasks';
import { users } from './users';

export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    corpo: text('corpo').notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({ task_idx: index('task_comments_task_idx').on(t.task_id) }),
);

export type TaskCommentRecord = typeof taskComments.$inferSelect;
