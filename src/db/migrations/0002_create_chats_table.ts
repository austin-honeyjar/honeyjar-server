import { sql } from 'drizzle-orm';

export const up = async (db: any) => {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    CREATE TABLE IF NOT EXISTS chats (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      thread_id UUID NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
};

export const down = async (db: any) => {
  await db.execute(sql`DROP TABLE IF EXISTS chats;`);
}; 