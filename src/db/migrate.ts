import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from 'pg';
import * as dotenv from 'dotenv';

// Ensure this runs first
dotenv.config();

const { Pool } = pg;

// Add console.log to debug connection details (remove in production)
console.log('DB Config:', {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  database: process.env.PG_DATABASE,
  // Don't log the actual password
  hasPassword: !!process.env.PG_PASSWORD
});

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

const db = drizzle(pool);

async function main() {
  console.log("Migration started...");
  await migrate(db, { migrationsFolder: "migrations" });
  console.log("Migration completed!");
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
}); 