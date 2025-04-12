"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = exports.chatMessages = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.chatMessages = (0, pg_core_1.pgTable)('chat_messages', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    role: (0, pg_core_1.text)('role').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
const up = async (db) => {
    await db.execute((0, drizzle_orm_1.sql) `
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
};
exports.up = up;
const down = async (db) => {
    await db.execute((0, drizzle_orm_1.sql) `DROP TABLE IF EXISTS chat_messages;`);
};
exports.down = down;
