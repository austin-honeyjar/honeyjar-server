"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDynamicTableData = exports.insertIntoDynamicTable = exports.dropDynamicTable = exports.createDynamicTable = void 0;
const pg_1 = __importDefault(require("pg"));
const { Pool } = pg_1.default;
const pool = new Pool({
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
});
const createDynamicTable = async (tableName, columns) => {
    const client = await pool.connect();
    try {
        const columnDefinitions = columns
            .map((_, index) => `column_${index + 1} TEXT`)
            .join(", ");
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        ${columnDefinitions}
      )
    `);
    }
    finally {
        client.release();
    }
};
exports.createDynamicTable = createDynamicTable;
const dropDynamicTable = async (tableName) => {
    const client = await pool.connect();
    try {
        await client.query(`DROP TABLE IF EXISTS ${tableName}`);
    }
    finally {
        client.release();
    }
};
exports.dropDynamicTable = dropDynamicTable;
const insertIntoDynamicTable = async (tableName, columns, data) => {
    const client = await pool.connect();
    try {
        const columnNames = columns.map((_, i) => `column_${i + 1}`).join(", ");
        const values = data
            .map(row => `(${row.map(cell => `'${cell.replace(/'/g, "''")}'`).join(", ")})`)
            .join(", ");
        await client.query(`
      INSERT INTO ${tableName} (${columnNames})
      VALUES ${values}
    `);
    }
    finally {
        client.release();
    }
};
exports.insertIntoDynamicTable = insertIntoDynamicTable;
const getDynamicTableData = async (tableName) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`SELECT * FROM ${tableName}`);
        return result.rows;
    }
    finally {
        client.release();
    }
};
exports.getDynamicTableData = getDynamicTableData;
