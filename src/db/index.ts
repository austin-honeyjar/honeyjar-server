import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { join } from 'path';

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
export * from './schema';

// Health check function for database
export const checkDatabaseHealth = async () => {
  try {
    // Simple query to test database connectivity
    const result = await client`SELECT 1 as health_check`;
    return {
      status: 'healthy',
      connectionString: connectionString?.replace(/:[^:@]*@/, ':***@'), // Hide password
      timestamp: new Date().toISOString(),
      testQuery: result.length > 0 ? 'success' : 'failed'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown database error',
      timestamp: new Date().toISOString()
    };
  }
};

// Function to ensure tables are created and migrations are run
export const ensureTables = async () => {
  try {
    // Enable UUID extension
    await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    console.log('UUID extension enabled');
    
    // Run migrations from the project root's migrations folder
    await migrate(db, { migrationsFolder: join(process.cwd(), 'migrations') });
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}; 