import { db } from '../db/index.js';
import { csvMetadata } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { 
  createDynamicTable, 
  dropDynamicTable, 
  insertIntoDynamicTable,
  getDynamicTableData 
} from '../utils/dynamicTable.js';

export const getAllTables = async (req, res) => {
  try {
    // Get all metadata entries
    const metadataEntries = await db.select().from(csvMetadata);

    // Get data for each table
    const tablesWithData = await Promise.all(
      metadataEntries.map(async (entry) => {
        const data = await getDynamicTableData(entry.tableName);
        return {
          ...entry,
          data
        };
      })
    );

    res.json(tablesWithData);
  } catch (error) {
    console.error('Error getting tables:', error);
    res.status(500).json({ error: 'Failed to get tables' });
  }
};

export const createTable = async (req, res) => {
  try {
    const { columns, data, fileName } = req.body;

    if (!columns || !data || !fileName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate a safe table name
    const tableName = `csv_${fileName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;

    // Create the table
    await createDynamicTable(tableName, columns);

    // Insert the data
    await insertIntoDynamicTable(tableName, columns, data);

    // Store metadata
    await db.insert(csvMetadata).values({
      tableName,
      columnNames: columns,
      fileName
    });

    res.json({ message: 'Table created successfully', tableName });
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ error: 'Failed to create table' });
  }
};

export const deleteTable = async (req, res) => {
  try {
    const { tableName } = req.body;

    if (!tableName) {
      return res.status(400).json({ error: 'Table name is required' });
    }

    // Delete the dynamic table
    await dropDynamicTable(tableName);

    // Delete metadata
    await db.delete(csvMetadata).where(eq(csvMetadata.tableName, tableName));

    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ error: 'Failed to delete table' });
  }
}; 