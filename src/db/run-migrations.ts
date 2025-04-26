import { db } from '.';
import { migrate as updateStepTypeEnum } from './migrations/0005_update_step_type_enum';

async function runMigrations() {
  console.log('Starting database migrations...');

  try {
    // Run the migrations in sequence
    await updateStepTypeEnum();

    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations when this script is executed directly
if (require.main === module) {
  runMigrations().catch(err => {
    console.error('Error running migrations:', err);
    process.exit(1);
  });
} 