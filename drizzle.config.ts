import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

// Check for DATABASE_URL first
if (!process.env.DATABASE_URL) {
  // Fall back to individual PG_* variables if DATABASE_URL not available
  if (!process.env.PG_USER || !process.env.PG_HOST || !process.env.PG_DATABASE || !process.env.PG_PASSWORD || !process.env.PG_PORT) {
    throw new Error('Either DATABASE_URL or all required PG_* environment variables must be defined');
}
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PG_HOST!,
        port: parseInt(process.env.PG_PORT!),
        user: process.env.PG_USER!,
        password: process.env.PG_PASSWORD!,
        database: process.env.PG_DATABASE!,
    ssl: false
  },
  verbose: true,
  strict: true,
} satisfies Config; 