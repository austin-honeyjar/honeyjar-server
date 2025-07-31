import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import logger from '../utils/logger';

export interface ThreadContext {
  contextType?: 'asset' | 'workflow' | null;
  contextId?: string;
  metadata?: Record<string, any>;
}

export interface ThreadWithContext {
  id: string;
  title: string;
  threadType: 'global' | 'asset' | 'workflow' | 'standard';
  contextType?: 'asset' | 'workflow' | null;
  contextId?: string;
  metadata?: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategorizedThreads {
  globalSession?: ThreadWithContext;
  suggested: ThreadWithContext[];
  assetDiscussions: ThreadWithContext[];
  workflowDiscussions: ThreadWithContext[];
  otherConversations: ThreadWithContext[];
}

export class ContextAwareChatService {
  
  /**
   * Get or create a global session thread for the user
   */
  async getOrCreateGlobalThread(userId: string, orgId: string): Promise<ThreadWithContext> {
    try {
      // Look for existing global thread
      const existingGlobal = await db
        .select()
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.userId, userId),
            eq(chatThreads.threadType, 'global'),
            eq(chatThreads.isActive, true)
          )
        )
        .limit(1);

      if (existingGlobal.length > 0) {
        const thread = existingGlobal[0];
        logger.info(`Found existing global thread: ${thread.id}`);
        return this.mapToThreadWithContext(thread);
      }

      // Create new global thread
      const newThread = await db
        .insert(chatThreads)
        .values({
          userId,
          orgId,
          title: '🌐 Global Session',
          threadType: 'global',
          contextType: null,
          contextId: null,
          isActive: true,
          metadata: {
            description: 'Your persistent chat that follows you across all contexts',
            autoCreated: true
          }
        })
        .returning();

      logger.info(`Created new global thread: ${newThread[0].id}`);
      return this.mapToThreadWithContext(newThread[0]);
      
    } catch (error) {
      logger.error('Error in getOrCreateGlobalThread:', error);
      throw new Error('Failed to get or create global thread');
    }
  }

  /**
   * Create an asset-specific thread
   */
  async createAssetThread(userId: string, orgId: string, assetId: string, assetName: string): Promise<ThreadWithContext> {
    try {
      const newThread = await db
        .insert(chatThreads)
        .values({
          userId,
          orgId,
          title: `💼 ${assetName}`,
          threadType: 'asset',
          contextType: 'asset',
          contextId: assetId,
          isActive: true,
          metadata: {
            assetName,
            assetId,
            description: `Focused discussion about ${assetName}`
          }
        })
        .returning();

      logger.info(`Created asset thread: ${newThread[0].id} for asset: ${assetId}`);
      return this.mapToThreadWithContext(newThread[0]);
      
    } catch (error) {
      logger.error('Error creating asset thread:', error);
      throw new Error('Failed to create asset thread');
    }
  }

  /**
   * Switch context for a global thread
   */
  async switchGlobalThreadContext(threadId: string, context: ThreadContext): Promise<void> {
    try {
      await db
        .update(chatThreads)
        .set({
          contextType: context.contextType,
          contextId: context.contextId,
          metadata: context.metadata,
          updatedAt: new Date()
        })
        .where(eq(chatThreads.id, threadId));

      // Add context switch message
      if (context.contextType && context.contextId) {
        const contextName = context.metadata?.name || context.contextId;
        const switchMessage = `🔄 Context switched to ${context.contextType}: "${contextName}"\nI now have access to this ${context.contextType}'s content and can help you work with it.`;
        
        await this.addContextMessage(threadId, switchMessage);
      }

      logger.info(`Switched context for thread ${threadId}:`, context);
      
    } catch (error) {
      logger.error('Error switching thread context:', error);
      throw new Error('Failed to switch thread context');
    }
  }

  /**
   * Get categorized threads for a user
   */
  async getCategorizedThreads(userId: string, currentContext?: ThreadContext): Promise<CategorizedThreads> {
    try {
      const allThreads = await db
        .select()
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.userId, userId),
            eq(chatThreads.isActive, true)
          )
        )
        .orderBy(desc(chatThreads.updatedAt));

      const categorized: CategorizedThreads = {
        suggested: [],
        assetDiscussions: [],
        workflowDiscussions: [],
        otherConversations: []
      };

      for (const thread of allThreads) {
        const threadWithContext = this.mapToThreadWithContext(thread);
        
        switch (thread.threadType) {
          case 'global':
            categorized.globalSession = threadWithContext;
            break;
          case 'asset':
            categorized.assetDiscussions.push(threadWithContext);
            break;
          case 'workflow':
            categorized.workflowDiscussions.push(threadWithContext);
            break;
          default:
            categorized.otherConversations.push(threadWithContext);
        }
      }

      // Add suggested threads based on current context
      if (currentContext?.contextType === 'asset' && currentContext.contextId) {
        const relatedAssetThreads = categorized.assetDiscussions.filter(
          t => t.contextId === currentContext.contextId
        );
        categorized.suggested.push(...relatedAssetThreads);
      }

      // Always suggest global session if not already current
      if (categorized.globalSession && currentContext?.contextType !== null) {
        categorized.suggested.unshift(categorized.globalSession);
      }

      logger.info(`Retrieved categorized threads for user ${userId}: ${allThreads.length} total`);
      return categorized;
      
    } catch (error) {
      logger.error('Error getting categorized threads:', error);
      throw new Error('Failed to get categorized threads');
    }
  }

  /**
   * Get thread suggestions based on context
   */
  async getThreadSuggestions(userId: string, context?: ThreadContext): Promise<ThreadWithContext[]> {
    try {
      let suggestions: ThreadWithContext[] = [];

      // Always include global thread as an option
      const globalThread = await this.getOrCreateGlobalThread(userId, ''); // TODO: Get orgId properly
      suggestions.push(globalThread);

      // Add context-specific suggestions
      if (context?.contextType === 'asset' && context.contextId) {
        const assetThreads = await db
          .select()
          .from(chatThreads)
          .where(
            and(
              eq(chatThreads.userId, userId),
              eq(chatThreads.contextType, 'asset'),
              eq(chatThreads.contextId, context.contextId),
              eq(chatThreads.isActive, true)
            )
          )
          .limit(3);

        suggestions.push(...assetThreads.map(t => this.mapToThreadWithContext(t)));
      }

      logger.info(`Generated ${suggestions.length} thread suggestions for user ${userId}`);
      return suggestions;
      
    } catch (error) {
      logger.error('Error getting thread suggestions:', error);
      throw new Error('Failed to get thread suggestions');
    }
  }

  /**
   * Archive old threads
   */
  async archiveOldThreads(userId: string, daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await db
        .update(chatThreads)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(chatThreads.userId, userId),
            eq(chatThreads.isActive, true),
            sql`${chatThreads.updatedAt} < ${cutoffDate}`,
            // Don't archive global threads
            sql`${chatThreads.threadType} != 'global'`
          )
        )
        .returning({ id: chatThreads.id });

      logger.info(`Archived ${result.length} old threads for user ${userId}`);
      return result.length;
      
    } catch (error) {
      logger.error('Error archiving old threads:', error);
      throw new Error('Failed to archive old threads');
    }
  }

  /**
   * Add a context switch message to a thread
   */
  private async addContextMessage(threadId: string, message: string): Promise<void> {
    try {
      await db
        .insert(chatMessages)
        .values({
          threadId,
          role: 'system',
          content: message,
          timestamp: new Date()
        });
        
    } catch (error) {
      logger.error('Error adding context message:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Map database thread to ThreadWithContext
   */
  private mapToThreadWithContext(dbThread: any): ThreadWithContext {
    return {
      id: dbThread.id,
      title: dbThread.title,
      threadType: dbThread.threadType || 'standard',
      contextType: dbThread.contextType,
      contextId: dbThread.contextId,
      metadata: dbThread.metadata,
      isActive: dbThread.isActive,
      createdAt: dbThread.createdAt,
      updatedAt: dbThread.updatedAt
    };
  }
} 