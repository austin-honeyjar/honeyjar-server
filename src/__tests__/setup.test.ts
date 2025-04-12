import { testDb } from './utils/testDb';
import { chats } from '../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';

describe('Database Setup Tests', () => {
  beforeAll(async () => {
    // Create tables before all tests
    await testDb.execute(sql`
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
    await testDb.delete(chats);
  });

  afterAll(async () => {
    // Clean up tables after all tests
    await testDb.execute(sql`
      DROP TABLE IF EXISTS chats;
    `);
  });

  describe('Chat Functionality', () => {
    it('should create a new chat', async () => {
      const threadId = uuidv4();
      const newChat = {
        id: uuidv4(),
        threadId,
        userId: 'test-user-1',
        role: 'user',
        content: 'Test chat message'
      };

      const [insertedChat] = await testDb.insert(chats).values(newChat).returning();

      expect(insertedChat).toBeDefined();
      expect(insertedChat.userId).toBe(newChat.userId);
      expect(insertedChat.role).toBe(newChat.role);
      expect(insertedChat.content).toBe(newChat.content);
      expect(insertedChat.threadId).toBe(threadId);
      expect(insertedChat.createdAt).toBeDefined();
    });

    it('should retrieve a chat by ID', async () => {
      const threadId = uuidv4();
      const newChat = {
        id: uuidv4(),
        threadId,
        userId: 'test-user-2',
        role: 'user',
        content: 'Test chat message 2'
      };

      const [insertedChat] = await testDb.insert(chats).values(newChat).returning();
      const [retrievedChat] = await testDb.select().from(chats).where(eq(chats.id, insertedChat.id));

      expect(retrievedChat).toBeDefined();
      expect(retrievedChat.id).toBe(insertedChat.id);
    });
  });
}); 