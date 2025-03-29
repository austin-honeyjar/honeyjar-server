import { testDb } from './utils/testDb';
import { chats, csvMetadata } from '../db/schema';
import { eq } from 'drizzle-orm';

describe('Database Setup Tests', () => {
  beforeEach(async () => {
    // Clean up tables before each test
    await testDb.delete(chats);
    await testDb.delete(csvMetadata);
  });

  describe('Chat Functionality', () => {
    it('should create a new chat', async () => {
      const newChat = {
        userId: 'test-user-1',
        role: 'user',
        content: 'Test chat message'
      };

      const [insertedChat] = await testDb.insert(chats).values(newChat).returning();

      expect(insertedChat).toBeDefined();
      expect(insertedChat.userId).toBe(newChat.userId);
      expect(insertedChat.role).toBe(newChat.role);
      expect(insertedChat.content).toBe(newChat.content);
      expect(insertedChat.createdAt).toBeDefined();
    });

    it('should retrieve a chat by ID', async () => {
      const newChat = {
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

  describe('CSV Functionality', () => {
    it('should create CSV metadata', async () => {
      const newCsvMetadata = {
        tableName: 'test_csv_table',
        columnNames: ['column1', 'column2'] as string[],
        fileName: 'test.csv'
      };

      const [insertedMetadata] = await testDb.insert(csvMetadata).values(newCsvMetadata).returning();

      expect(insertedMetadata).toBeDefined();
      expect(insertedMetadata.tableName).toBe(newCsvMetadata.tableName);
      expect(insertedMetadata.columnNames).toEqual(newCsvMetadata.columnNames);
      expect(insertedMetadata.fileName).toBe(newCsvMetadata.fileName);
      expect(insertedMetadata.createdAt).toBeDefined();
    });

    it('should enforce unique table names', async () => {
      const metadata = {
        tableName: 'unique_table',
        columnNames: ['column1'] as string[],
        fileName: 'test.csv'
      };

      // First insert should succeed
      await testDb.insert(csvMetadata).values(metadata);

      // Second insert with same table name should fail
      await expect(
        testDb.insert(csvMetadata).values(metadata)
      ).rejects.toThrow();
    });
  });
}); 