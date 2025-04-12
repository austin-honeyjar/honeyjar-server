import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const csvMetadata = pgTable("csv_metadata", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull().unique(),
  columnNames: text("column_names").array().notNull(),
  fileName: text("file_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatThreads = pgTable('chat_threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  threadId: text('thread_id').notNull().references(() => chatThreads.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

// Function to create a dynamic table schema based on column names
export function createDynamicTableSchema(tableName, columnNames) {
  const columns = {
    id: serial('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  };
  
  // Add dynamic columns based on columnNames
  columnNames.forEach(colName => {
    const safeColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    columns[safeColName] = text(safeColName);
  });
  
  return pgTable(tableName, columns);
} 