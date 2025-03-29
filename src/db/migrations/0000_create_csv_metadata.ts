import { sql } from 'drizzle-orm';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const csvMetadata = pgTable('csv_metadata', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull().unique(),
  columnNames: text('column_names').array().notNull(),
  fileName: text('file_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const up = async (db: any) => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS csv_metadata (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL UNIQUE,
      column_names TEXT[] NOT NULL,
      file_name TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
};

export const down = async (db: any) => {
  await db.execute(sql`DROP TABLE IF EXISTS csv_metadata;`);
}; 