import { sql } from 'drizzle-orm';
import { db } from '..';

export async function migrate() {
  try {
    console.log('Starting migration: Adding generate_thread_title to step_type enum');

    // Add the new enum value to the step_type type
    await db.execute(sql`
      ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'generate_thread_title';
    `);

    console.log('Migration completed successfully: generate_thread_title added to step_type enum');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
} 