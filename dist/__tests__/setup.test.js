"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testDb_1 = require("./utils/testDb");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
const drizzle_orm_2 = require("drizzle-orm");
describe('Database Setup Tests', () => {
    beforeAll(async () => {
        // Create tables before all tests
        await testDb_1.testDb.execute((0, drizzle_orm_2.sql) `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
      CREATE TABLE IF NOT EXISTS chats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        thread_id UUID NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    });
    beforeEach(async () => {
        // Clean up tables before each test
        await testDb_1.testDb.delete(schema_1.chats);
    });
    afterAll(async () => {
        // Clean up tables after all tests
        await testDb_1.testDb.execute((0, drizzle_orm_2.sql) `
      DROP TABLE IF EXISTS chats;
    `);
    });
    describe('Chat Functionality', () => {
        it('should create a new chat', async () => {
            const threadId = (0, uuid_1.v4)();
            const newChat = {
                id: (0, uuid_1.v4)(),
                threadId,
                userId: 'test-user-1',
                role: 'user',
                content: 'Test chat message'
            };
            const [insertedChat] = await testDb_1.testDb.insert(schema_1.chats).values(newChat).returning();
            expect(insertedChat).toBeDefined();
            expect(insertedChat.userId).toBe(newChat.userId);
            expect(insertedChat.role).toBe(newChat.role);
            expect(insertedChat.content).toBe(newChat.content);
            expect(insertedChat.threadId).toBe(threadId);
            expect(insertedChat.createdAt).toBeDefined();
        });
        it('should retrieve a chat by ID', async () => {
            const threadId = (0, uuid_1.v4)();
            const newChat = {
                id: (0, uuid_1.v4)(),
                threadId,
                userId: 'test-user-2',
                role: 'user',
                content: 'Test chat message 2'
            };
            const [insertedChat] = await testDb_1.testDb.insert(schema_1.chats).values(newChat).returning();
            const [retrievedChat] = await testDb_1.testDb.select().from(schema_1.chats).where((0, drizzle_orm_1.eq)(schema_1.chats.id, insertedChat.id));
            expect(retrievedChat).toBeDefined();
            expect(retrievedChat.id).toBe(insertedChat.id);
        });
    });
});
