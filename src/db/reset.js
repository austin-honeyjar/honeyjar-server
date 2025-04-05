import { db } from './index.js';
import { sql } from 'drizzle-orm';
import { csvMetadata } from './schema.js';

async function resetDatabase() {
  try {
    console.log('Starting database reset...');

    // Get all tables from metadata
    const tables = await db.select().from(csvMetadata);
    console.log(`Found ${tables.length} tables to drop`);

    // Drop all dynamic tables
    for (const table of tables) {
      console.log(`Dropping table: ${table.tableName}`);
      await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(table.tableName)}`);
    }

    // Drop metadata table
    console.log('Dropping metadata table');
    await db.execute(sql`DROP TABLE IF EXISTS csv_metadata`);

    // Recreate metadata table
    console.log('Recreating metadata table');
    await db.execute(sql`
      CREATE TABLE csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);

    console.log('Database reset completed successfully');
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
}

// Run the reset
resetDatabase().catch(console.error); 