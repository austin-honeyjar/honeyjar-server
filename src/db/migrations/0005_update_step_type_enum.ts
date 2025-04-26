import { sql } from 'drizzle-orm';
import { db } from '..';

export async function migrate() {
  try {
    console.log('Starting migration: Adding asset_creation to step_type enum');

    // Add the new enum value to the step_type type
    await db.execute(sql`
      ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'asset_creation';
    `);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
} 