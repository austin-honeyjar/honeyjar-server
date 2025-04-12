"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = exports.csvMetadata = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.csvMetadata = (0, pg_core_1.pgTable)('csv_metadata', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tableName: (0, pg_core_1.text)('table_name').notNull().unique(),
    columnNames: (0, pg_core_1.text)('column_names').array().notNull(),
    fileName: (0, pg_core_1.text)('file_name').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
const up = async (db) => {
    await db.execute((0, drizzle_orm_1.sql) `
    CREATE TABLE IF NOT EXISTS csv_metadata (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL UNIQUE,
      column_names TEXT[] NOT NULL,
      file_name TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
};
exports.up = up;
const down = async (db) => {
    await db.execute((0, drizzle_orm_1.sql) `DROP TABLE IF EXISTS csv_metadata;`);
};
exports.down = down;
