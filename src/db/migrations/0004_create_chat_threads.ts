import { sql } from 'drizzle-orm';
import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';

export const chatThreads = pgTable('chat_threads', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const up = async (db: any) => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
};

export const down = async (db: any) => {
  await db.execute(sql`DROP TABLE IF EXISTS chat_threads;`);
}; 