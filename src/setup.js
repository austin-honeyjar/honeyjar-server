import 'dotenv/config';
import pkg from 'pg';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './db.js';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT || 5432,
  });

  try {
    // Read and execute the setup SQL
    const sqlPath = join(__dirname, 'setup.sql');
    const setupSQL = await readFile(sqlPath, 'utf8');
    
    await pool.query(setupSQL);
    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await pool.end();
  }
}

async function setup() {
  const client = await pool.connect();
  console.log('Connected to database');

  try {
    // Create csv_metadata table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('csv_metadata table created/verified');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_table_name ON csv_metadata(table_name);
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_created_at ON csv_metadata(created_at);
    `);
    console.log('Indexes created/verified');

    // Check if there are any existing tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'csv_%'
    `);
    console.log('Existing CSV tables:', tablesResult.rows);

    // For each existing table, ensure it has metadata
    for (const { table_name } of tablesResult.rows) {
      const metadataResult = await client.query(
        'SELECT * FROM csv_metadata WHERE table_name = $1',
        [table_name]
      );

      if (metadataResult.rows.length === 0) {
        // Get column names from the table
        const columnsResult = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND column_name != 'id'
          ORDER BY ordinal_position
        `, [table_name]);

        const columnNames = columnsResult.rows.map(col => col.column_name);

        // Insert metadata
        await client.query(
          'INSERT INTO csv_metadata (table_name, column_names, file_name) VALUES ($1, $2, $3)',
          [table_name, columnNames, table_name]
        );
        console.log(`Added metadata for table: ${table_name}`);
      }
    }

  } catch (error) {
    console.error('Error during setup:', error);
    throw error;
  } finally {
    client.release();
    console.log('Database connection released');
  }
}

setupDatabase();
setup().then(() => {
  console.log('Setup completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
}); 