import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import csvRoutes from './routes/csv.js';
import chatRoutes from './routes/chatRoutes.js';
import pkg from 'pg';

const app = express();
const port = Number(process.env.PORT) || 3001;

const { Pool } = pkg;

// Database setup
const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Create tables if they don't exist
async function ensureTables() {
  const client = await pool.connect();
  try {
    // Create chats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create csv_metadata table
    await client.query(`
      CREATE TABLE IF NOT EXISTS csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_table_name ON csv_metadata(table_name);
      CREATE INDEX IF NOT EXISTS idx_csv_metadata_created_at ON csv_metadata(created_at);
      CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
      CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at);
    `);

    console.log('Database tables and indexes verified');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    client.release();
  }
}

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/csv', csvRoutes);
app.use('/api/chat', chatRoutes);

// Start server after ensuring tables exist
ensureTables().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
}); 