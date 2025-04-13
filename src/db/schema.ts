import { pgTable, serial, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// CSV Metadata Table
export const csvMetadata = pgTable('csv_metadata', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull().unique(),
  fileName: text('file_name').notNull(),
  columnNames: jsonb('column_names').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Helper function to create dynamic table schemas for CSV data
export const createDynamicTableSchema = (tableName: string, columnNames: string[]) => {
  const columns: Record<string, any> = {
    id: serial('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  };

  columnNames.forEach((colName) => {
    const safeColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    columns[safeColName] = text(safeColName);
  });

  return pgTable(tableName, columns);
}; 