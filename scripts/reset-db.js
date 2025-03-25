import 'dotenv/config';
import pkg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.PG_USER || !process.env.PG_HOST || !process.env.PG_DATABASE || !process.env.PG_PASSWORD) {
  console.error('Missing required PostgreSQL environment variables');
  process.exit(1);
}

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT || 5432,
});

async function resetDatabase() {
  const client = await pool.connect();
  console.log('Connected to database');

  try {
    await client.query('BEGIN');
    console.log('Transaction started');

    // Get all CSV tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'csv_%'
    `);
    console.log('Found tables:', tablesResult.rows);

    // Drop each table
    for (const { table_name } of tablesResult.rows) {
      console.log(`Dropping table: ${table_name}`);
      await client.query(`DROP TABLE IF EXISTS ${table_name}`);
    }

    // Recreate metadata table with the correct schema
    console.log('Recreating metadata table');
    await client.query(`
      CREATE TABLE IF NOT EXISTS csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_table_name ON csv_metadata(table_name);
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_created_at ON csv_metadata(created_at);
    `);
    console.log('Indexes created');

    await client.query('COMMIT');
    console.log('Transaction committed');
    console.log('Database reset completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting database:', error);
    process.exit(1);
  } finally {
    client.release();
    console.log('Database connection released');
    process.exit(0);
  }
}

resetDatabase(); 