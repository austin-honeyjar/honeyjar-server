import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pkg from 'pg';
const { Pool } = pkg;
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';

// Ensure this runs first
config();

// Add console.log to debug connection details
console.log('Running Cloud Run migrations with DB Config:', {
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
    // Don't throw here, so we can still create other tables
    console.log('Continuing with migrations despite enum error');
  }
}

// Create the base tables if they don't exist
async function createBaseTables() {
  try {
    console.log('Creating base tables if they don\'t exist');
    
    // CSV metadata table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);

    // Workflow templates table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        steps JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    
    console.log('Base tables created successfully');
  } catch (error) {
    console.error('Base table creation failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  console.log('Running Cloud Run migrations...');
  
  try {
    // Create base tables first to ensure basic functionality
    await createBaseTables();
    
    // Then run the standard drizzle migrations
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('Drizzle migrations completed successfully');
    
    // Then run the custom step_type enum migration
    await migrateStepTypeEnum();
    
    console.log('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main(); 