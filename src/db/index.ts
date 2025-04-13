import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import dotenv from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in environment variables. Please check your .env file.');
}

console.log('Connecting to database:', connectionString);

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

// Export schema for use in other files
export * from './schema.js';

// Function to ensure tables are created and migrations are run
export const ensureTables = async () => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    
    // Run migrations
    await migrate(db, { migrationsFolder: join(__dirname, '../../migrations') });
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}; 