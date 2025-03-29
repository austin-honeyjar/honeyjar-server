import { db } from '../db/index.js';
import { csvMetadata, createDynamicTableSchema } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const getAllTables = async (req, res) => {
  try {
    console.log('Fetching all tables...');
    
    // Get all metadata entries
    const metadataEntries = await db.select().from(csvMetadata).orderBy(csvMetadata.createdAt);
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
        } catch (error) {
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
  } catch (error) {
    console.error('Error getting tables:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
};

export const createTable = async (req, res) => {
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
    const columnDefinitions = columns.map(colName => {
      const safeColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
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

    // Insert metadata
    await db.insert(csvMetadata).values({
      tableName,
      columnNames: columns,
      fileName
    });
    console.log(`Inserted metadata for table: ${tableName}`);

    // Create the dynamic table schema for Drizzle
    const dynamicTable = createDynamicTableSchema(tableName, columns);

    // Insert data using Drizzle
    const insertData = data.map(row => {
      const rowData = {};
      columns.forEach((colName, index) => {
        const safeColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        rowData[safeColName] = row[index];
      });
      return rowData;
    });

    await db.insert(dynamicTable).values(insertData);
    console.log(`Inserted ${insertData.length} rows into table: ${tableName}`);

    res.json({ message: 'Table created successfully', tableName });
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
};

export const deleteTable = async (req, res) => {
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
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
}; 