import { sql } from 'drizzle-orm';

export const up = async (db: any) => {
  // Drop existing tables
  await db.execute(sql`
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS chat_threads CASCADE;
  `);

  // Create chat_threads table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  // Create chat_messages table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id),
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
};

export const down = async (db: any) => {
  await db.execute(sql`
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS chat_threads CASCADE;
  `);
}; 