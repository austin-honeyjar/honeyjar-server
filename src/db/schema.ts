import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const chats = pgTable('chats', {
  id: uuid('id').primaryKey(),
  threadId: uuid('thread_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}); 