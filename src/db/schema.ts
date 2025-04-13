import { pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// CSV Metadata table
export const csvMetadata = pgTable('csv_metadata', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull().unique(),
  columnNames: text('column_names').array().notNull(),
  fileName: text('file_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Chat threads table
export const chatThreads = pgTable('chat_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Chat messages table
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull().references(() => chatThreads.id),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Helper function to create dynamic table schemas for CSV data
export const createDynamicTableSchema = (tableName: string, columnNames: string[]) => {
  const columns: Record<string, any> = {
    id: serial('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  };

  columnNames.forEach((colName) => {
    const safeColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    columns[safeColName] = text(safeColName);
  });

  return pgTable(tableName, columns);
}; 