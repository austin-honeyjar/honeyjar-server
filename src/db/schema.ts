import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Schema for the metadata table
export const csvMetadata = pgTable('csv_metadata', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull().unique(),
  columnNames: text('column_names').array().notNull(),
  fileName: text('file_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Schema for chat messages
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(), // 'user' or 'assistant'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Function to generate dynamic table schema
export const createDynamicTableSchema = (tableName: string, columns: string[]) => {
  const columnDefinitions: Record<string, any> = {
    id: serial('id').primaryKey(),
  };

  // Add dynamic columns
  columns.forEach((_, index) => {
    columnDefinitions[`column_${index + 1}`] = text(`column_${index + 1}`);
  });

  return pgTable(tableName, columnDefinitions);
}; 