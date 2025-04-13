import { db } from './index';
import { sql } from 'drizzle-orm';

async function fixChatTables() {
  try {
    console.log('Checking and fixing chat tables...');

    // Drop and recreate chat_threads table
    await db.execute(sql`
      DROP TABLE IF EXISTS chat_messages CASCADE;
      DROP TABLE IF EXISTS chat_threads CASCADE;

      CREATE TABLE chat_threads (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE chat_messages (
        id SERIAL PRIMARY KEY,
        thread_id INTEGER NOT NULL REFERENCES chat_threads(id),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    console.log('Chat tables fixed successfully');
  } catch (error) {
    console.error('Error fixing chat tables:', error);
    throw error;
  }
}

// Run the fix
fixChatTables().catch(console.error); 