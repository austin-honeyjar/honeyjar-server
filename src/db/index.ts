import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.PG_USER) throw new Error('Missing PG_USER');
if (!process.env.PG_HOST) throw new Error('Missing PG_HOST');
if (!process.env.PG_DATABASE) throw new Error('Missing PG_DATABASE');
if (!process.env.PG_PASSWORD) throw new Error('Missing PG_PASSWORD');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

export const db = drizzle(pool, { schema }); 