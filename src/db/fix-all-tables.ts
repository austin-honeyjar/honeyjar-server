import { db } from './index';
import { sql } from 'drizzle-orm';

export async function fixAllTables() {
  try {
    // Drop existing tables in the correct order to handle dependencies
    await db.execute(sql`
      DROP TABLE IF EXISTS chat_messages CASCADE;
      DROP TABLE IF EXISTS chat_threads CASCADE;
      DROP TABLE IF EXISTS csv_metadata CASCADE;
    `);

    // Create tables in the correct order
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id UUID NOT NULL REFERENCES chat_threads(id),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    console.log('All tables recreated successfully');
  } catch (error) {
    console.error('Error recreating tables:', error);
    throw error;
  }
}

// Run the fix
fixAllTables().catch(console.error); 