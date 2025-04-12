"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chats = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.chats = (0, pg_core_1.pgTable)('chats', {
    id: (0, pg_core_1.uuid)('id').primaryKey(),
    threadId: (0, pg_core_1.uuid)('thread_id').notNull(),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    role: (0, pg_core_1.text)('role').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
