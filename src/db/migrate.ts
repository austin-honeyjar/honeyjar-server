import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from 'pg';
import { config } from 'dotenv';

// Ensure this runs first
config();

// Add console.log to debug connection details (remove in production)
console.log('DB Config:', {
  databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not Set'
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function main(): Promise<void> {
  console.log('Running migrations...');
  
  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main(); 