import pool from '../db.js';

export const createTable = async (req, res) => {
  const client = await pool.connect();
  console.log('Connected to database');

  try {
    const { tableName, columns, data } = req.body;
    console.log('Received request:', { tableName, columnsCount: columns.length, dataRows: data.length });

    await client.query('BEGIN');
    console.log('Transaction started');

    // Check if table already exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);

    if (tableExists.rows[0].exists) {
      console.log(`Table ${tableName} already exists, cleaning up any partial data...`);
      // Clean up any partial data
      await client.query(`DROP TABLE IF EXISTS ${tableName}`);
      await client.query('DELETE FROM csv_metadata WHERE table_name = $1', [tableName]);
      await client.query('COMMIT');
      throw new Error(`Table ${tableName} already exists`);
    }

    // Create table with numbered columns
    const columnDefinitions = columns.map((_, index) => `column_${index + 1} TEXT`).join(', ');
    const createTableQuery = `
      CREATE TABLE ${tableName} (
        id SERIAL PRIMARY KEY,
        ${columnDefinitions}
      )
    `;
    console.log('Creating table with query:', createTableQuery);
    await client.query(createTableQuery);
    console.log('Table created successfully');

    // Store column names in metadata table
    const metadataQuery = `
      INSERT INTO csv_metadata (table_name, column_names, file_name)
      VALUES ($1, $2::text[], $3)
      ON CONFLICT (table_name) DO UPDATE 
      SET column_names = EXCLUDED.column_names,
          file_name = EXCLUDED.file_name
    `;
    console.log('Inserting metadata');
    await client.query(metadataQuery, [
      tableName, 
      columns, // Pass the array directly
      tableName.split('_').slice(1).join('_')
    ]);
    console.log('Metadata inserted successfully');

    // Insert data
    const insertQuery = `
      INSERT INTO ${tableName} (${columns.map((_, i) => `column_${i + 1}`).join(', ')})
      VALUES ${data.map(row => 
        `(${row.map(cell => `'${cell.replace(/'/g, "''")}'`).join(', ')})`
      ).join(', ')}
    `;
    console.log('Inserting data');
    await client.query(insertQuery);
    console.log('Data inserted successfully');

    await client.query('COMMIT');
    console.log('Transaction committed');

    // Fetch the newly created table data to verify
    const verifyQuery = `
      SELECT * FROM ${tableName}
    `;
    const verifyResult = await client.query(verifyQuery);
    console.log(`Verified ${verifyResult.rows.length} rows in new table`);

    res.json({ 
      message: 'Table created and data inserted successfully',
      tableName,
      rowCount: verifyResult.rows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in createTable:', error);
    
    // If table creation failed, try to clean up any partially created table
    try {
      await client.query(`DROP TABLE IF EXISTS ${tableName}`);
      await client.query('DELETE FROM csv_metadata WHERE table_name = $1', [tableName]);
      console.log('Cleaned up partially created table and metadata');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    client.release();
    console.log('Database connection released');
  }
};

export const deleteTable = async (req, res) => {
  const { tableName } = req.query;
  
  if (!tableName) {
    return res.status(400).json({ error: 'Table name is required' });
  }

  const client = await pool.connect();
  console.log('Connected to database');

  try {
    await client.query('BEGIN');
    console.log('Transaction started');

    // First remove from metadata
    console.log('Removing metadata');
    await client.query('DELETE FROM csv_metadata WHERE table_name = $1', [tableName]);
    console.log('Metadata removed successfully');

    // Then drop the table
    console.log('Dropping table:', tableName);
    await client.query(`DROP TABLE IF EXISTS ${tableName}`);
    console.log('Table dropped successfully');

    await client.query('COMMIT');
    console.log('Transaction committed');

    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in deleteTable:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    client.release();
    console.log('Database connection released');
  }
};

export const getAllTables = async (req, res) => {
  const client = await pool.connect();
  console.log('Connected to database');

  try {
    // First, get all tables from the database
    console.log('Fetching all tables from database...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'csv_%'
      AND table_name != 'csv_metadata'
      ORDER BY table_name DESC
    `);
    console.log('Found tables:', tablesResult.rows);

    if (tablesResult.rows.length === 0) {
      console.log('No tables found');
      return res.json([]);
    }

    // For each table, fetch its data and metadata
    const tablesWithData = await Promise.all(tablesResult.rows.map(async ({ table_name }) => {
      try {
        console.log(`Processing table: ${table_name}`);
        
        // Get table structure
        const columnsResult = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND column_name != 'id'
          ORDER BY ordinal_position
        `, [table_name]);
        
        const columns = columnsResult.rows.map(col => col.column_name);
        console.log(`Found columns for ${table_name}:`, columns);

        // Get metadata if it exists
        let metadata = null;
        try {
          const metadataResult = await client.query(
            'SELECT * FROM csv_metadata WHERE table_name = $1',
            [table_name]
          );
          if (metadataResult.rows.length > 0) {
            metadata = metadataResult.rows[0];
            // Ensure column_names is an array
            if (typeof metadata.column_names === 'string') {
              metadata.column_names = metadata.column_names.split(',').map(col => col.trim());
            }
            console.log(`Found metadata for ${table_name}:`, metadata);
          } else {
            console.log(`No metadata found for ${table_name}`);
          }
        } catch (metadataError) {
          console.log(`Error fetching metadata for ${table_name}:`, metadataError);
        }

        // Get table data
        const dataResult = await client.query(`SELECT * FROM ${table_name}`);
        console.log(`Found ${dataResult.rows.length} rows for table ${table_name}`);

        // Transform the data to match our expected format
        const transformedData = dataResult.rows.map(row => {
          const transformedRow = {};
          columns.forEach((col, index) => {
            transformedRow[`column_${index + 1}`] = row[col];
          });
          return transformedRow;
        });

        const result = {
          table_name,
          column_names: metadata?.column_names || columns,
          file_name: metadata?.file_name || table_name,
          data: transformedData
        };
        console.log(`Final result for ${table_name}:`, result);
        return result;
      } catch (tableError) {
        console.error(`Error processing table ${table_name}:`, tableError);
        // Don't return null, return an empty table instead
        return {
          table_name,
          column_names: [],
          file_name: table_name,
          data: []
        };
      }
    }));

    // Filter out any invalid entries
    const validTables = tablesWithData.filter(table => 
      table && 
      table.table_name && 
      Array.isArray(table.column_names) && 
      Array.isArray(table.data)
    );
    console.log('Final valid tables:', validTables);

    res.json(validTables);
  } catch (error) {
    console.error('Error in getAllTables:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    client.release();
    console.log('Database connection released');
  }
}; 