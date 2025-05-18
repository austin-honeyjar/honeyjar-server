import { Client } from 'pg';
import { setTimeout } from 'timers/promises';
import { config } from 'dotenv';

// Load environment variables
config();

// Get connection params from environment variables
const dbHost = process.env.PG_HOST || 'db';
const dbPort = process.env.PG_PORT || '5432';
const dbUser = process.env.PG_USER || 'postgres';
const dbPassword = process.env.PG_PASSWORD || 'Password1';
const dbName = process.env.PG_DATABASE || 'client_db';

// Configuration
const maxRetries = 15;
const retryDelay = 2000; // ms

/**
 * Check if database connection can be established
 */
async function checkDatabaseConnection() {
  const client = new Client({
    host: dbHost,
    port: parseInt(dbPort),
    user: dbUser,
    password: dbPassword,
    database: dbName
  });

  try {
    await client.connect();
    console.log(`🟢 Successfully connected to database at ${dbHost}:${dbPort}`);
    await client.end();
    return true;
  } catch (error: any) {
    console.log(`🔴 Failed to connect to database: ${error.message}`);
    return false;
  }
}

/**
 * Wait for database to be ready
 */
async function waitForDatabase() {
  console.log(`⏳ Waiting for database at ${dbHost}:${dbPort}...`);
  
  let connected = false;
  let attempts = 0;
  
  while (!connected && attempts < maxRetries) {
    attempts++;
    console.log(`Attempt ${attempts}/${maxRetries}...`);
    
    connected = await checkDatabaseConnection();
    
    if (!connected) {
      console.log(`Waiting ${retryDelay/1000} seconds before next attempt...`);
      await setTimeout(retryDelay);
    }
  }
  
  if (connected) {
    console.log("✅ Database is ready!");
    return true;
  } else {
    console.error("❌ Failed to connect to database after maximum retries");
    throw new Error("Database connection failed after maximum retries");
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  waitForDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Unexpected error:", err);
      process.exit(1);
    });
}

// Export for use in other modules
export { waitForDatabase, checkDatabaseConnection }; 