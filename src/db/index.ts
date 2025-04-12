import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

export const ensureTables = async () => {
  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}; 