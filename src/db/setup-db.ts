import { Pool } from 'pg';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Setup database for Honeyjar Server
 * - Adds steps column to workflow_templates table if it doesn't exist
 * - Performs any other necessary database setup
 */
async function setupDatabase() {
  // Create connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();
  try {
    console.log("Setting up database for Honeyjar Server...");
    
    // Check if the steps column exists in workflow_templates table
    const stepsColumnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'workflow_templates' AND column_name = 'steps'
    `);
    
    if (stepsColumnCheck.rows.length === 0) {
      console.log("Adding steps column to workflow_templates table...");
      await client.query(`
        ALTER TABLE workflow_templates 
        ADD COLUMN steps JSONB NOT NULL DEFAULT '{}'
      `);
      console.log("✅ Steps column added successfully");
    } else {
      console.log("✅ Steps column already exists");
    }
    
    console.log("Database setup complete.");
  } catch (error) {
    console.error("❌ Error setting up database:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log("Database setup completed successfully");
      process.exit(0);
    })
    .catch(err => {
      console.error("Database setup failed:", err);
      process.exit(1);
    });
}

// Export for use in other modules
export { setupDatabase }; 