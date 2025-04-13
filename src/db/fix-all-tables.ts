import { db } from './index';
import { sql } from 'drizzle-orm';

async function fixAllTables() {
  try {
    console.log('Checking and fixing all tables...');

    // Drop all tables in correct order to handle dependencies
    await db.execute(sql`
      DROP TABLE IF EXISTS chat_messages CASCADE;
      DROP TABLE IF EXISTS chat_threads CASCADE;
      DROP TABLE IF EXISTS csv_metadata CASCADE;
    `);

    // Create csv_metadata table first
    await db.execute(sql`
      CREATE TABLE csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // Create chat_threads table
    await db.execute(sql`
      CREATE TABLE chat_threads (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // Create chat_messages table with foreign key reference
    await db.execute(sql`
      CREATE TABLE chat_messages (
        id SERIAL PRIMARY KEY,
        thread_id INTEGER NOT NULL REFERENCES chat_threads(id),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    console.log('All tables fixed successfully');
  } catch (error) {
    console.error('Error fixing tables:', error);
    throw error;
  }
}

// Run the fix
fixAllTables().catch(console.error); 