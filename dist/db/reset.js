"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("./index.js");
const drizzle_orm_1 = require("drizzle-orm");
const schema_js_1 = require("./schema.js");
async function resetDatabase() {
    try {
        console.log('Starting database reset...');
        // Get all tables from metadata
        const tables = await index_js_1.db.select().from(schema_js_1.csvMetadata);
        console.log(`Found ${tables.length} tables to drop`);
        // Drop all dynamic tables
        for (const table of tables) {
            console.log(`Dropping table: ${table.tableName}`);
            await index_js_1.db.execute((0, drizzle_orm_1.sql) `DROP TABLE IF EXISTS ${drizzle_orm_1.sql.identifier(table.tableName)}`);
        }
        // Drop metadata table
        console.log('Dropping metadata table');
        await index_js_1.db.execute((0, drizzle_orm_1.sql) `DROP TABLE IF EXISTS csv_metadata`);
        // Recreate metadata table
        console.log('Recreating metadata table');
        await index_js_1.db.execute((0, drizzle_orm_1.sql) `
      CREATE TABLE csv_metadata (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        column_names TEXT[] NOT NULL,
        file_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
        console.log('Database reset completed successfully');
    }
    catch (error) {
        console.error('Error resetting database:', error);
        throw error;
    }
}
// Run the reset
resetDatabase().catch(console.error);
