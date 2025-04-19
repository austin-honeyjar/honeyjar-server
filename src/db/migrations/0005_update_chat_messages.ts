import { sql } from 'drizzle-orm';

export const up = async (db: any) => {
  // First drop the existing table
  await db.execute(sql`DROP TABLE IF EXISTS chat_messages;`);

  // Create the new table with UUID and thread_id
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id UUID NOT NULL REFERENCES chat_threads(id),
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
};

export const down = async (db: any) => {
  // Drop the new table
  await db.execute(sql`DROP TABLE IF EXISTS chat_messages;`);

  // Recreate the old table structure
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
}; 