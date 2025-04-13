import { db } from './index';
import { up } from './migrations/0000_create_all_tables';

async function createTables() {
  try {
    console.log('Starting table creation...');
    await up(db);
    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

// Run the table creation
createTables().catch(console.error); 