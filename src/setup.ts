import 'dotenv/config';
import { Pool } from 'pg';
import { readFile } from 'fs/promises';
import { join } from 'path';
import pool from './db/db';

const __dirname = process.cwd();

interface TableRow {
  table_name: string;
}

interface ColumnRow {
  column_name: string;
}

async function setupDatabase(): Promise<void> {
  const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: Number(process.env.PG_PORT) || 5432,
  });

  try {
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

async function setup(): Promise<void> {
  const client = await pool.connect();
  console.log('Connected to database');

  try {
    // Create chats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('chats table created/verified');

    // Create csv_metadata table
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
      CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
      CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at);
    `);
    console.log('Indexes created/verified');

    const tablesResult = await client.query<TableRow>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'csv_%'
    `);
    console.log('Existing CSV tables:', tablesResult.rows);

    for (const { table_name } of tablesResult.rows) {
      const metadataResult = await client.query(
        'SELECT * FROM csv_metadata WHERE table_name = $1',
        [table_name]
      );

      if (metadataResult.rows.length === 0) {
        const columnsResult = await client.query<ColumnRow>(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND column_name != 'id'
          ORDER BY ordinal_position
        `, [table_name]);

        const columnNames = columnsResult.rows.map(col => col.column_name);

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