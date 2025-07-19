import { db } from '../db';
import { chatThreads, chatMessages, assets, workflows } from '../db/schema';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export type ThreadType = 'global' | 'asset' | 'workflow' | 'standard';
export type ContextType = 'asset' | 'workflow' | null;

export interface ContextInfo {
  type: ContextType;
  id: string;
  title: string;
  metadata?: Record<string, any>;
}

export interface ThreadWithContext {
  id: string;
  userId: string;
  orgId: string;
  title: string;
  threadType: ThreadType;
  contextId?: string;
  contextType?: ContextType;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  contextInfo?: ContextInfo;
}

export class ContextAwareChatService {
  
  /**
   * Get or create a global session thread for the user
   * This thread follows the user across all contexts
   */
  async getOrCreateGlobalThread(userId: string, orgId: string): Promise<ThreadWithContext> {
    try {
      // Check if user already has an active global thread
      const existingGlobalThread = await db.query.chatThreads.findFirst({
        where: and(
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId),
          eq(chatThreads.threadType, 'global'),
          eq(chatThreads.isActive, true)
        )
      });

      if (existingGlobalThread) {
        return existingGlobalThread as ThreadWithContext;
      }

      // Create new global thread
      const [newGlobalThread] = await db.insert(chatThreads)
        .values({
          id: uuidv4(),
          userId,
          orgId,
          title: '🌐 Global Session Chat',
          threadType: 'global',
          contextType: null,
          isActive: true,
          metadata: {
            description: 'Persistent chat that follows you across all contexts',
            isGlobal: true
          }
        })
        .returning();

      // Add welcome message to global thread
      await this.addContextMessage(
        newGlobalThread.id,
        'assistant',
        'Welcome to your Global Session Chat! This conversation will follow you across all assets and workflows. Ask me anything!',
        { isWelcome: true }
      );

      logger.info('Created new global thread', { userId, orgId, threadId: newGlobalThread.id });
      return newGlobalThread as ThreadWithContext;

    } catch (error) {
      logger.error('Error getting/creating global thread', { error, userId, orgId });
      throw error;
    }
  }

  /**
   * Get or create an asset-specific thread
   */
  async getOrCreateAssetThread(userId: string, orgId: string, assetId: string): Promise<ThreadWithContext> {
    try {
      // Get asset info for context
      const asset = await db.query.assets.findFirst({
        where: eq(assets.id, assetId)
      });

      if (!asset) {
        throw new Error(`Asset not found: ${assetId}`);
      }

      // Check if asset thread already exists
      const existingThread = await db.query.chatThreads.findFirst({
        where: and(
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId),
          eq(chatThreads.threadType, 'asset'),
          eq(chatThreads.contextId, assetId),
          eq(chatThreads.isActive, true)
        )
      });

      if (existingThread) {
        return {
          ...existingThread,
          contextInfo: {
            type: 'asset',
            id: assetId,
            title: asset.title,
            metadata: asset.metadata as Record<string, any> | undefined
          }
        } as ThreadWithContext;
      }

      // Create new asset thread
      const [newThread] = await db.insert(chatThreads)
        .values({
          id: uuidv4(),
          userId,
          orgId,
          title: `💼 ${asset.title}`,
          threadType: 'asset',
          contextId: assetId,
          contextType: 'asset',
          isActive: true,
          metadata: {
            assetType: asset.type,
            assetTitle: asset.title,
            contextDescription: `Discussion about ${asset.type}: ${asset.title}`
          }
        })
        .returning();

      // Add context injection message
      await this.addContextMessage(
        newThread.id,
        'assistant',
        `Now discussing **${asset.type}**: "${asset.title}". I have access to this asset's content and can help you refine, expand, or create related materials.`,
        { contextType: 'asset', contextId: assetId }
      );

      logger.info('Created new asset thread', { userId, orgId, assetId, threadId: newThread.id });
      return {
        ...newThread,
        contextInfo: {
          type: 'asset',
          id: assetId,
          title: asset.title,
          metadata: asset.metadata as Record<string, any> | undefined
        }
      } as ThreadWithContext;

    } catch (error) {
      logger.error('Error getting/creating asset thread', { error, userId, orgId, assetId });
      throw error;
    }
  }

  /**
   * Get threads with smart categorization and context info
   */
  async getThreadsWithContext(userId: string, orgId: string): Promise<ThreadWithContext[]> {
    try {
      const threads = await db.query.chatThreads.findMany({
        where: and(
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId),
          eq(chatThreads.isActive, true)
        ),
        orderBy: [desc(chatThreads.updatedAt)]
      });

      // Enrich threads with context information
      const enrichedThreads: ThreadWithContext[] = [];

      for (const thread of threads) {
        let contextInfo: ContextInfo | undefined;

        if (thread.contextType === 'asset' && thread.contextId) {
          const asset = await db.query.assets.findFirst({
            where: eq(assets.id, thread.contextId)
          });
          if (asset) {
            contextInfo = {
              type: 'asset',
              id: thread.contextId,
              title: asset.title,
              metadata: asset.metadata as Record<string, any> | undefined
            };
          }
        } else if (thread.contextType === 'workflow' && thread.contextId) {
          const workflow = await db.query.workflows.findFirst({
            where: eq(workflows.id, thread.contextId)
          });
          if (workflow) {
            contextInfo = {
              type: 'workflow',
              id: thread.contextId,
              title: `Workflow ${workflow.id}`,
              metadata: { status: workflow.status }
            };
          }
        }

        enrichedThreads.push({
          ...thread,
          contextInfo
        } as ThreadWithContext);
      }

      return enrichedThreads;

    } catch (error) {
      logger.error('Error getting threads with context', { error, userId, orgId });
      throw error;
    }
  }

  /**
   * Add a message with automatic context injection
   */
  async addContextMessage(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ) {
    try {
      // Get thread context
      const thread = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.id, threadId)
      });

      if (!thread) {
        throw new Error(`Thread not found: ${threadId}`);
      }

      // Prepare message content with context injection
      let enrichedContent = content;
      const messageMetadata = { ...metadata };

      // Add context information to metadata
      if (thread.contextType && thread.contextId) {
        messageMetadata.context = {
          type: thread.contextType,
          id: thread.contextId
        };
      }

      // For assistant messages in asset context, inject current asset info
      if (role === 'assistant' && thread.contextType === 'asset' && thread.contextId) {
        const asset = await db.query.assets.findFirst({
          where: eq(assets.id, thread.contextId)
        });
        
        if (asset) {
          messageMetadata.currentAsset = {
            id: asset.id,
            title: asset.title,
            type: asset.type
          };
        }
      }

      // Insert message
      const [message] = await db.insert(chatMessages)
        .values({
          id: uuidv4(),
          threadId,
          userId: role === 'user' ? thread.userId : 'system',
          role,
          content: enrichedContent,
          createdAt: new Date()
        })
        .returning();

      // Update thread's updated_at timestamp
      await db.update(chatThreads)
        .set({ updatedAt: new Date() })
        .where(eq(chatThreads.id, threadId));

      return message;

    } catch (error) {
      logger.error('Error adding context message', { error, threadId, role });
      throw error;
    }
  }

  /**
   * Switch context for a global thread
   * This moves the conversation to a new context while preserving history
   */
  async switchContext(
    globalThreadId: string,
    newContextType: ContextType,
    newContextId?: string
  ): Promise<{ message: string; contextInfo?: ContextInfo }> {
    try {
      const thread = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.id, globalThreadId)
      });

      if (!thread || thread.threadType !== 'global') {
        throw new Error('Can only switch context for global threads');
      }

      let contextInfo: ContextInfo | undefined;
      let switchMessage = '';

      if (newContextType === 'asset' && newContextId) {
        const asset = await db.query.assets.findFirst({
          where: eq(assets.id, newContextId)
        });
        
        if (asset) {
          contextInfo = {
            type: 'asset',
            id: newContextId,
            title: asset.title,
            metadata: asset.metadata as Record<string, any> | undefined
          };
          switchMessage = `🔄 **Context switched to ${asset.type}**: "${asset.title}"\n\nI now have access to this asset's content and can help you work with it. Previous conversation context is preserved.`;
        }
      } else if (newContextType === 'workflow' && newContextId) {
        const workflow = await db.query.workflows.findFirst({
          where: eq(workflows.id, newContextId)
        });
        
        if (workflow) {
          contextInfo = {
            type: 'workflow',
            id: newContextId,
            title: `Workflow ${workflow.id}`,
            metadata: { status: workflow.status }
          };
          switchMessage = `🔄 **Context switched to Workflow**: ${workflow.id}\n\nI can now help you with this workflow. Previous conversation context is preserved.`;
        }
      } else {
        // Switching to no context (global mode)
        switchMessage = `🌐 **Switched to Global Context**\n\nI'm now in global mode and can help you with general questions across all your assets and workflows.`;
      }

      // Add context switch message
      await this.addContextMessage(
        globalThreadId,
        'assistant',
        switchMessage,
        { 
          isContextSwitch: true,
          previousContext: thread.contextType ? { type: thread.contextType, id: thread.contextId } : null,
          newContext: contextInfo ? { type: contextInfo.type, id: contextInfo.id } : null
        }
      );

      // Update thread metadata to track current context (but keep it as global thread)
      const currentMetadata = (thread.metadata as Record<string, any>) || {};
      await db.update(chatThreads)
        .set({
          metadata: {
            ...currentMetadata,
            currentContext: contextInfo ? { type: contextInfo.type, id: contextInfo.id } : null,
            lastContextSwitch: new Date().toISOString()
          },
          updatedAt: new Date()
        })
        .where(eq(chatThreads.id, globalThreadId));

      return { message: switchMessage, contextInfo };

    } catch (error) {
      logger.error('Error switching context', { error, globalThreadId, newContextType, newContextId });
      throw error;
    }
  }

  /**
   * Get suggested threads based on current context
   */
  async getSuggestedThreads(
    userId: string,
    orgId: string,
    currentContext?: { type: ContextType; id: string }
  ): Promise<ThreadWithContext[]> {
    try {
      const suggestions: ThreadWithContext[] = [];

      // Always suggest global thread
      const globalThread = await this.getOrCreateGlobalThread(userId, orgId);
      suggestions.push(globalThread);

      // If in asset context, suggest related threads
      if (currentContext?.type === 'asset') {
        const asset = await db.query.assets.findFirst({
          where: eq(assets.id, currentContext.id)
        });

        if (asset) {
          // Suggest threads related to same asset type
          const relatedThreads = await db.query.chatThreads.findMany({
            where: and(
              eq(chatThreads.userId, userId),
              eq(chatThreads.orgId, orgId),
              eq(chatThreads.isActive, true),
              sql`metadata->>'assetType' = ${asset.type}`
            ),
            limit: 3,
            orderBy: [desc(chatThreads.updatedAt)]
          });

          for (const thread of relatedThreads) {
            if (thread.id !== globalThread.id) {
              suggestions.push(thread as ThreadWithContext);
            }
          }
        }
      }

      return suggestions;

    } catch (error) {
      logger.error('Error getting suggested threads', { error, userId, orgId, currentContext });
      return [];
    }
  }

  /**
   * Archive old threads to keep the interface clean
   */
  async archiveOldThreads(userId: string, orgId: string, daysOld = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await db.update(chatThreads)
        .set({ isActive: false })
        .where(and(
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId),
          sql`updated_at < ${cutoffDate}`,
          eq(chatThreads.isActive, true),
          // Never archive global threads
          sql`thread_type != 'global'`
        ))
        .returning({ id: chatThreads.id });

      logger.info('Archived old threads', { 
        userId, 
        orgId, 
        archivedCount: result.length,
        daysOld 
      });

      return result.length;

    } catch (error) {
      logger.error('Error archiving old threads', { error, userId, orgId });
      return 0;
    }
  }
} 