import { Pool } from 'pg';

interface DbConfig {
  PG_USER: string;
  PG_HOST: string;
  PG_DATABASE: string;
  PG_PASSWORD: string;
  PG_PORT?: string;
}

const requiredEnvVars = ['PG_USER', 'PG_HOST', 'PG_DATABASE', 'PG_PASSWORD'] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required PostgreSQL environment variable: ${envVar}`);
  }
}

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: Number(process.env.PG_PORT) || 5432,
});

export default pool; 