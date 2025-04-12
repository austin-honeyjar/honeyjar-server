"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_postgres_1 = require("drizzle-orm/node-postgres");
const migrator_1 = require("drizzle-orm/node-postgres/migrator");
const drizzle_orm_1 = require("drizzle-orm");
const pg_1 = __importDefault(require("pg"));
const dotenv_1 = require("dotenv");
const { Pool } = pg_1.default;
// Ensure this runs first
(0, dotenv_1.config)();
// Add console.log to debug connection details (remove in production)
console.log('DB Config:', {
    databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not Set'
});
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
const db = (0, node_postgres_1.drizzle)(pool);
async function main() {
    console.log('Running migrations...');
    try {
        await (0, migrator_1.migrate)(db, { migrationsFolder: './src/db/migrations' });
        console.log('Migrations completed successfully');
    }
    catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
    finally {
        await pool.end();
    }
}
main();
