import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pkg from 'pg';
const { Pool } = pkg;
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';

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

// Custom migration for step_type enum
async function migrateStepTypeEnum() {
  try {
    console.log('Running custom migration: Adding asset_creation to step_type enum');
    
    // Add the new enum value to the step_type type
    await db.execute(sql`
      ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'asset_creation';
    `);
    
    console.log('Custom enum migration completed successfully');
  } catch (error) {
    console.error('Custom enum migration failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  console.log('Running migrations...');
  
  try {
    // First run the standard drizzle migrations
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('Drizzle migrations completed successfully');
    
    // Then run the custom step_type enum migration
    await migrateStepTypeEnum();
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main(); 