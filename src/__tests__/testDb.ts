import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import dotenv from "dotenv";

dotenv.config();

const testPool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

export const testDb = drizzle(testPool, { schema });

// Clean up after all tests
afterAll(async () => {
  await testPool.end();
}); 