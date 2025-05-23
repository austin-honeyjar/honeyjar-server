import { Request, Response } from 'express';
import { db } from '../db/index';
import { csvMetadata, createDynamicTableSchema } from '../db/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

interface DbMetadataEntry {
  id: number;
  tableName: string;
  fileName: string;
  columnNames: string[];
  createdAt: Date;
}

export const getAllTables = async (req: Request, res: Response) => {
  try {
    console.log('Fetching all tables...');
    
    // Get all metadata entries
    const metadataEntries = await db.select().from(csvMetadata).orderBy(csvMetadata.createdAt) as DbMetadataEntry[];
    console.log(`Found ${metadataEntries.length} metadata entries`);

    // Get data for each table
    const tablesWithData = await Promise.all(
      metadataEntries.map(async (entry) => {
        try {
          console.log(`Fetching data for table: ${entry.tableName}`);
          const dynamicTable = createDynamicTableSchema(entry.tableName, entry.columnNames);
          const data = await db.select().from(dynamicTable);
          console.log(`Found ${data.length} rows in table ${entry.tableName}`);
          return {
            ...entry,
            data
          };
        } catch (error: any) {
          console.error(`Error fetching table ${entry.tableName}:`, error);
          // If table doesn't exist, remove it from metadata
          if (error.code === '42P01') { // relation does not exist
            console.log(`Table ${entry.tableName} does not exist, removing from metadata`);
            await db.delete(csvMetadata).where(eq(csvMetadata.tableName, entry.tableName));
            return null;
          }
          throw error;
        }
      })
    );

    // Filter out null entries (tables that were deleted)
    const validTables = tablesWithData.filter(table => table !== null);
    console.log(`Successfully fetched ${validTables.length} tables with data`);
    res.json(validTables);
  } catch (error: any) {
    console.error('Error getting tables:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
};

interface CreateTableRequest extends Request {
  body: {
    columns: string[];
    data: any[][];
    fileName: string;
  }
}

export const createTable = async (req: CreateTableRequest, res: Response) => {
  const { columns, data, fileName } = req.body;
  
  if (!columns || !data || !fileName) {
    console.error('Missing required fields:', { columns, data, fileName });
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Generate a safe table name
    const timestamp = Date.now();
    const tableName = `csv_${fileName}_${timestamp}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    console.log(`Creating table: ${tableName}`);

    // Create table using raw SQL
    const columnDefinitions = columns
      .filter(colName => colName.toLowerCase() !== 'id') // Exclude id column if present
      .map(colName => {
        const safeColName = colName.toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .slice(0, 63); // PostgreSQL has a 63-character limit for identifiers
        return `${safeColName} TEXT`;
      }).join(', ');

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        ${sql.raw(columnDefinitions)}
      )
    `);
    console.log(`Created table: ${tableName}`);

    // Insert metadata with properly formatted PostgreSQL array
    await db.insert(csvMetadata).values({
      tableName,
      fileName,
      columnNames: sql`ARRAY[${sql.join(columns.map(col => sql`${col}`), sql`, `)}]::text[]`
    });
    console.log(`Inserted metadata for table: ${tableName}`);

    // Create the dynamic table schema for Drizzle
    const dynamicTable = createDynamicTableSchema(tableName, columns);

    // Insert data using Drizzle
    const insertData = data.map(row => {
      const rowData: Record<string, string> = {};
      columns.forEach((colName, index) => {
        if (colName.toLowerCase() !== 'id') { // Skip id column when inserting data
          const safeColName = colName.toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .slice(0, 63); // PostgreSQL has a 63-character limit for identifiers
          rowData[safeColName] = row[index];
        }
      });
      return rowData;
    });

    await db.insert(dynamicTable).values(insertData);
    console.log(`Inserted ${insertData.length} rows into table: ${tableName}`);

    res.json({ message: 'Table created successfully', tableName });
  } catch (error: any) {
    console.error('Error creating table:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
};

interface DeleteTableRequest extends Request {
  query: {
    tableName: string;
  }
}

export const deleteTable = async (req: DeleteTableRequest, res: Response) => {
  const { tableName } = req.query;
  
  if (!tableName) {
    console.error('Missing table name in delete request');
    return res.status(400).json({ error: 'Table name is required' });
  }

  try {
    console.log(`Deleting table: ${tableName}`);
    
    // Delete metadata first
    await db.delete(csvMetadata).where(eq(csvMetadata.tableName, tableName));
    console.log(`Deleted metadata for table: ${tableName}`);

    // Note: Drizzle doesn't support DROP TABLE directly, so we'll need to use raw SQL
    await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)}`);
    console.log(`Dropped table: ${tableName}`);

    res.json({ message: 'Table deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting table:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
}; 