import { sql } from 'drizzle-orm';

export const up = async (db: any) => {
  // Drop all existing tables
  await db.execute(sql`
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS chat_threads CASCADE;
    DROP TABLE IF EXISTS csv_metadata CASCADE;
  `);

  // Create csv_metadata table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS csv_metadata (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL UNIQUE,
      column_names TEXT[] NOT NULL,
      file_name TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  // Create chat_threads table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  // Create chat_messages table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
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
    DROP TABLE IF EXISTS csv_metadata CASCADE;
  `);
}; 