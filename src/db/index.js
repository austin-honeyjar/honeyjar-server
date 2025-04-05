import { drizzle } from "drizzle-orm/node-postgres";
import pkg from 'pg';
import * as schema from "./schema.js";
import { logger } from '../services/logger.js';

const { Pool } = pkg;

// Log environment variables (without sensitive data)
logger.info('Database configuration:', {
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  database: process.env.PG_DATABASE,
  hasPassword: !!process.env.PG_PASSWORD
});

// Validate required environment variables
const requiredEnvVars = ['PG_USER', 'PG_PASSWORD', 'PG_DATABASE'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  const error = `Missing required environment variables: ${missingVars.join(', ')}`;
  logger.error(error);
  throw new Error(error);
}

const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    logger.error('Error connecting to the database:', err);
    throw err;
  }
  logger.info('Successfully connected to database');
  release();
});

export const db = drizzle(pool, { schema }); 