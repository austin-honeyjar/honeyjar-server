import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../db';
import { chatThreads, chatMessages } from '../db/schema';
import { OpenAIService } from './openai.service';
import { ragService } from './ragService';
import { simpleCache } from '../utils/simpleCache';
import logger from '../utils/logger';

export interface ThreadTitleUpdateResult {
  updated: boolean;
  newTitle?: string;
  reason?: string;
  messageCount?: number;
  shouldUpdate?: boolean;
}

export interface ThreadTitleContext {
  threadId: string;
  userId: string;
  orgId: string;
  currentTitle: string;
  messageCount: number;
  recentMessages: Array<{
    role: string;
    content: string;
    timestamp: Date;
  }>;
  conversationSummary?: string;
  workflowContext?: any;
}

export interface TitleUpdatePreferences {
  enabled: boolean;
  frequency: 'conservative' | 'normal' | 'aggressive';
  manualOnly: boolean;
}

export class ThreadTitleService {
  private openAIService: OpenAIService;
  private readonly MESSAGE_THRESHOLD = 20; // Update title every 20 messages
  private readonly MIN_MESSAGES_FOR_UPDATE = 2; // Minimum messages before first update
  private readonly MAX_TITLE_LENGTH = 60;
  private readonly TITLE_CACHE_TTL = 300000; // 5 minutes cache for title generation
  private titleCache: Map<string, { title: string; timestamp: number }> = new Map();

  constructor() {
    this.openAIService = new OpenAIService();
  }

  /**
   * Check if thread title should be updated using multiple smart triggers
   */
  async shouldUpdateTitle(threadId: string, userId: string, orgId: string): Promise<{
    shouldUpdate: boolean;
    reason?: string;
    messageCount: number;
    lastUpdateCount?: number;
  }> {
    try {
      logger.info('🏷️ ThreadTitleService: Checking if title should update', {
        threadId: threadId.substring(0, 8)
      });
      // Get current thread info
      const thread = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.id, threadId)
      });

      if (!thread) {
        return { shouldUpdate: false, messageCount: 0, reason: 'Thread not found' };
      }

      // Count total messages in thread
      const messageCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId));

      const messageCount = messageCountResult[0]?.count || 0;

      // Simple tracking: use updatedAt to determine if we've updated recently
      const lastUpdateTime = new Date(thread.updatedAt).getTime();
      const now = Date.now();
      const hoursSinceLastUpdate = (now - lastUpdateTime) / (1000 * 60 * 60);

      // Get user preferences (default to normal)
      const preferences = await this.getUserTitlePreferences(userId, orgId);
      
      if (preferences.manualOnly) {
        return {
          shouldUpdate: false,
          reason: 'Manual updates only (user preference)',
          messageCount
        };
      }

      if (!preferences.enabled) {
        return {
          shouldUpdate: false,
          reason: 'Title updates disabled (user preference)',
          messageCount
        };
      }

      // Run multiple checks in parallel for efficiency
      const [
        messageThresholdCheck,
        intentShiftCheck,
        workflowTransitionCheck
      ] = await Promise.all([
        this.checkMessageThreshold(messageCount, preferences.frequency),
        this.checkIntentShift(threadId, userId, orgId),
        this.checkWorkflowTransition(threadId)
      ]);

      // Timing check temporarily removed for testing - titles will update immediately

      // Return the first positive check
      if (messageThresholdCheck.shouldUpdate) return messageThresholdCheck;
      if (intentShiftCheck.shouldUpdate) return intentShiftCheck;
      if (workflowTransitionCheck.shouldUpdate) return workflowTransitionCheck;

      return {
        shouldUpdate: false,
        reason: 'No update triggers met',
        messageCount
      };

    } catch (error) {
      logger.error('Error checking if title should update:', { error, threadId });
      return { shouldUpdate: false, messageCount: 0, reason: 'Error checking update conditions' };
    }
  }

  /**
   * Update thread title with AI-generated content based on conversation
   */
  async updateThreadTitle(threadId: string, userId: string, orgId: string): Promise<ThreadTitleUpdateResult> {
    try {
      logger.info('Starting thread title update', { threadId: threadId.substring(0, 8) });

      // Check if we should update
      const shouldUpdateCheck = await this.shouldUpdateTitle(threadId, userId, orgId);
      if (!shouldUpdateCheck.shouldUpdate) {
        return {
          updated: false,
          reason: shouldUpdateCheck.reason,
          messageCount: shouldUpdateCheck.messageCount,
          shouldUpdate: false
        };
      }

      // Gather conversation context
      const context = await this.gatherThreadContext(threadId, userId, orgId);
      if (!context) {
        return {
          updated: false,
          reason: 'Could not gather thread context',
          shouldUpdate: false
        };
      }

      // Check cache first
      const cacheKey = `${threadId}-${context.messageCount}`;
      const cached = this.titleCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.TITLE_CACHE_TTL) {
        logger.info('Using cached title', { threadId: threadId.substring(0, 8) });
        return await this.applyTitleUpdate(threadId, cached.title, context.messageCount, 'Cached title');
      }

      // Generate new title with AI
      const newTitle = await this.generateSmartTitle(context);
      if (!newTitle) {
        return {
          updated: false,
          reason: 'Failed to generate new title',
          shouldUpdate: true
        };
      }

      // Cache the generated title
      this.titleCache.set(cacheKey, { title: newTitle, timestamp: Date.now() });

      // Apply the title update
      return await this.applyTitleUpdate(threadId, newTitle, context.messageCount, shouldUpdateCheck.reason);

    } catch (error) {
      logger.error('Error updating thread title:', { error: error instanceof Error ? error.message : String(error), threadId });
      return {
        updated: false,
        reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
        shouldUpdate: false
      };
    }
  }

  /**
   * Generate a smart, contextual title based on conversation content
   */
  private async generateSmartTitle(context: ThreadTitleContext): Promise<string | null> {
    try {
      // Build conversation summary for title generation
      const conversationText = context.recentMessages
        .slice(-15) // Use last 15 messages for title generation
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      // Get RAG context for better title generation
      let ragContext = null;
      try {
        ragContext = await ragService.getRelevantContext(
          context.userId,
          context.orgId,
          'title_generation',
          'title_generation',
          conversationText.substring(0, 500) // Use first 500 chars for RAG query
        );
      } catch (ragError) {
        logger.warn('Could not get RAG context for title generation:', { error: ragError });
      }

      const titlePrompt = this.buildTitleGenerationPrompt(context, conversationText, ragContext);
      
      const response = await this.openAIService.generateResponse(
        titlePrompt,
        '', // No user input needed for title generation
        {
          model: 'gpt-4o-mini', // Use faster model for title generation
          max_tokens: 50,
          temperature: 0.7
        }
      );

      const generatedTitle = response?.trim();
      
      if (!generatedTitle) {
        logger.warn('No title generated from OpenAI response');
        return null;
      }

      // Clean and validate title
      const cleanTitle = this.cleanTitle(generatedTitle);
      logger.info('Generated new thread title', { 
        threadId: context.threadId.substring(0, 8),
        oldTitle: context.currentTitle,
        newTitle: cleanTitle,
        messageCount: context.messageCount
      });

      return cleanTitle;

    } catch (error) {
      logger.error('Error generating smart title:', { error, threadId: context.threadId });
      return null;
    }
  }

  /**
   * Extract clean text content from structured message format
   */
  private extractMessageText(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (typeof content === 'object' && content !== null) {
      // Handle structured message format: {"type":"text","text":"actual content","decorators":[]}
      if (content.text) {
        return content.text;
      }
      
      // Handle asset messages: {"type":"asset","text":"Here's your generated...","decorators":[...]}
      if (content.type === 'asset' && content.text) {
        return content.text;
      }
      
      // Fallback: try to extract meaningful text from any object
      if (typeof content.content === 'string') {
        return content.content;
      }
      
      // Last resort: stringify but limit length
      const stringified = JSON.stringify(content);
      return stringified.length > 200 ? stringified.substring(0, 200) + '...' : stringified;
    }
    
    return String(content);
  }

  /**
   * Build the prompt for AI title generation
   */
  private buildTitleGenerationPrompt(
    context: ThreadTitleContext, 
    conversationText: string, 
    ragContext: any
  ): string {
    const userContext = ragContext?.userDefaults ? `
User Context:
- Company: ${ragContext.userDefaults.companyName || 'Unknown'}
- Industry: ${ragContext.userDefaults.industry || 'Unknown'}
- Role: ${ragContext.userDefaults.jobTitle || 'Unknown'}` : '';

    const workflowContext = context.workflowContext ? `
Current Workflow: ${context.workflowContext.name || 'None'}
Workflow Step: ${context.workflowContext.currentStep || 'None'}` : '';

    return `You are a conversation title generator. Create a concise, descriptive title for this chat thread.

REQUIREMENTS:
- Maximum ${this.MAX_TITLE_LENGTH} characters
- Capture the main topic/purpose of the conversation
- Be specific and actionable when possible
- Use professional, clear language
- Avoid generic titles like "Chat" or "Conversation"

${userContext}${workflowContext}

CONVERSATION CONTEXT:
Current Title: "${context.currentTitle}"
Message Count: ${context.messageCount}
Recent Conversation:
${conversationText}

Generate a title that accurately reflects what this conversation is about. Focus on the main topic, goal, or outcome being discussed.

TITLE:`;
  }

  /**
   * Clean and validate the generated title
   */
  private cleanTitle(title: string): string {
    // Remove quotes and extra whitespace
    let cleaned = title.replace(/^["']|["']$/g, '').trim();
    
    // Remove "TITLE:" prefix if present
    cleaned = cleaned.replace(/^TITLE:\s*/i, '');
    
    // Truncate if too long
    if (cleaned.length > this.MAX_TITLE_LENGTH) {
      cleaned = cleaned.substring(0, this.MAX_TITLE_LENGTH - 3) + '...';
    }
    
    // Ensure it's not empty
    if (!cleaned || cleaned.length < 3) {
      cleaned = 'Conversation';
    }
    
    return cleaned;
  }

  /**
   * Apply the title update to the database (simplified - no complex metadata)
   */
  private async applyTitleUpdate(
    threadId: string, 
    newTitle: string, 
    messageCount: number, 
    reason?: string
  ): Promise<ThreadTitleUpdateResult> {
    try {
      // Get current thread
      const currentThread = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.id, threadId)
      });

      if (!currentThread) {
        throw new Error('Thread not found');
      }

      // Simple update - just title and updatedAt timestamp
      const [updatedThread] = await db
        .update(chatThreads)
        .set({
          title: newTitle,
          updatedAt: new Date() // This serves as our "last update" timestamp
        })
        .where(eq(chatThreads.id, threadId))
        .returning();

      // Invalidate caches after successful title update
      try {
        simpleCache.del(`thread:${threadId}`);
        simpleCache.del(`threads:${currentThread.userId}:${currentThread.orgId}`);
        logger.debug('Invalidated thread caches after title update', { 
          threadId: threadId.substring(0, 8) 
        });
      } catch (cacheError) {
        logger.warn('Failed to invalidate caches after title update:', { 
          error: cacheError, 
          threadId: threadId.substring(0, 8) 
        });
      }

      logger.info('Thread title updated successfully', {
        threadId: threadId.substring(0, 8),
        oldTitle: currentThread.title,
        newTitle,
        messageCount,
        reason
      });

      return {
        updated: true,
        newTitle,
        reason,
        messageCount,
        shouldUpdate: true
      };

    } catch (error) {
      logger.error('Error applying title update:', { error, threadId });
      throw error;
    }
  }

  /**
   * Gather comprehensive context about the thread for title generation
   */
  private async gatherThreadContext(
    threadId: string, 
    userId: string, 
    orgId: string
  ): Promise<ThreadTitleContext | null> {
    try {
      // Get thread info
      const thread = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.id, threadId)
      });

      if (!thread) {
        return null;
      }

      // Get recent messages (last 20 for context)
      const messages = await db
        .select({
          role: chatMessages.role,
          content: chatMessages.content,
          createdAt: chatMessages.createdAt
        })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(20);

      // Count total messages
      const messageCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId));

      const messageCount = messageCountResult[0]?.count || 0;
      
      // Add debug logging to track message count discrepancies
      logger.debug('🏷️ Message count check', {
        threadId: threadId.substring(0, 8),
        rawCount: messageCount,
        recentMessagesLength: messages.length
      });

      // Format messages for context
      const recentMessages = messages.reverse().map(msg => ({
        role: msg.role,
        content: this.extractMessageText(msg.content),
        timestamp: msg.createdAt
      }));

      // Try to get workflow context (if available)
      let workflowContext = null;
      try {
        // This would be injected if available
        const { enhancedWorkflowService } = await import('./enhanced-workflow.service');
        const workflow = await enhancedWorkflowService.getWorkflowByThreadId(threadId);
        if (workflow) {
          workflowContext = {
            name: 'Unknown Workflow', // TODO: Get template name from workflow
            currentStep: 'Unknown Step', // TODO: Get current step name from workflow
            status: workflow.status
          };
        }
      } catch (workflowError) {
        // Workflow context is optional
        logger.debug('Could not get workflow context for title generation:', { error: workflowError });
      }

      return {
        threadId,
        userId,
        orgId,
        currentTitle: thread.title,
        messageCount,
        recentMessages,
        workflowContext
      };

    } catch (error) {
      logger.error('Error gathering thread context:', { error, threadId });
      return null;
    }
  }

  /**
   * Check message count threshold based on user preferences
   */
  private async checkMessageThreshold(messageCount: number, frequency: string): Promise<{
    shouldUpdate: boolean;
    reason?: string;
    messageCount: number;
  }> {
    const thresholds = {
      conservative: 30,
      normal: 20,
      aggressive: 10
    };

    const threshold = thresholds[frequency as keyof typeof thresholds] || 20;
    const minMessages = Math.max(5, Math.floor(threshold / 4));

    // First update: when we reach minimum messages (5, 7, or 10 depending on frequency)
    if (messageCount === minMessages) {
      return {
        shouldUpdate: true,
        reason: `First title update (${messageCount} messages, ${frequency} frequency)`,
        messageCount
      };
    }

    // Subsequent updates: every threshold interval after the first update
    if (messageCount > minMessages && (messageCount - minMessages) % threshold === 0) {
      return {
        shouldUpdate: true,
        reason: `Regular title update (${messageCount} messages, ${frequency} frequency)`,
        messageCount
      };
    }

    return {
      shouldUpdate: false,
      reason: `Message threshold not met (${messageCount}, next at ${minMessages} or ${minMessages + Math.ceil((messageCount - minMessages) / threshold) * threshold})`,
      messageCount
    };
  }

  /**
   * Check for intent shifts in recent conversation
   */
  private async checkIntentShift(threadId: string, userId: string, orgId: string): Promise<{
    shouldUpdate: boolean;
    reason?: string;
    messageCount: number;
  }> {
    try {
      // Get recent messages to analyze intent shift
      const recentMessages = await db
        .select({
          content: chatMessages.content,
          role: chatMessages.role,
          createdAt: chatMessages.createdAt
        })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(12);

      const messageCount = recentMessages.length;

      if (messageCount < 8) {
        return { shouldUpdate: false, reason: 'Not enough messages for intent analysis', messageCount };
      }

      // Split into early and recent messages
      const earlyMessages = recentMessages.slice(-6).filter(m => m.role === 'user');
      const recentMessagesFiltered = recentMessages.slice(0, 6).filter(m => m.role === 'user');

      if (earlyMessages.length < 2 || recentMessagesFiltered.length < 2) {
        return { shouldUpdate: false, reason: 'Not enough user messages for intent analysis', messageCount };
      }

      // Simple keyword-based intent detection
      const workflowKeywords = {
        'press_release': ['press release', 'announcement', 'news', 'media'],
        'blog_post': ['blog', 'article', 'post', 'content'],
        'social_media': ['social', 'twitter', 'linkedin', 'facebook', 'instagram'],
        'email': ['email', 'newsletter', 'campaign', 'outreach'],
        'pitch': ['pitch', 'proposal', 'deck', 'presentation'],
        'general': ['help', 'question', 'how', 'what', 'why']
      };

      const detectIntent = (messages: any[]) => {
        const text = messages.map(m => 
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        ).join(' ').toLowerCase();

        for (const [intent, keywords] of Object.entries(workflowKeywords)) {
          if (keywords.some(keyword => text.includes(keyword))) {
            return intent;
          }
        }
        return 'general';
      };

      const earlyIntent = detectIntent(earlyMessages);
      const recentIntent = detectIntent(recentMessagesFiltered);

      if (earlyIntent !== recentIntent && recentIntent !== 'general') {
        return {
          shouldUpdate: true,
          reason: `Intent shift detected: ${earlyIntent} → ${recentIntent}`,
          messageCount
        };
      }

      return {
        shouldUpdate: false,
        reason: `No significant intent shift (${earlyIntent} → ${recentIntent})`,
        messageCount
      };

    } catch (error) {
      logger.error('Error checking intent shift:', { error, threadId });
      return { shouldUpdate: false, reason: 'Error analyzing intent shift', messageCount: 0 };
    }
  }

  /**
   * Check for workflow transitions (simplified)
   */
  private async checkWorkflowTransition(threadId: string): Promise<{
    shouldUpdate: boolean;
    reason?: string;
    messageCount: number;
  }> {
    // Simplified: Just check if we have a workflow (indicates workflow activity)
    try {
      const { enhancedWorkflowService } = await import('./enhanced-workflow.service');
      const workflow = await enhancedWorkflowService.getWorkflowByThreadId(threadId);
      
      const messageCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId));
      const messageCount = messageCountResult[0]?.count || 0;

      if (workflow) {
        return {
          shouldUpdate: true,
          reason: 'Active workflow detected',
          messageCount
        };
      }

      return { shouldUpdate: false, reason: 'No active workflow', messageCount };
    } catch (error) {
      return { shouldUpdate: false, reason: 'Could not check workflow', messageCount: 0 };
    }
  }



  // Timing check removed - titles update immediately when conditions are met

  /**
   * Get user preferences for title updates
   */
  private async getUserTitlePreferences(userId: string, orgId: string): Promise<TitleUpdatePreferences> {
    try {
      // For now, return default preferences
      // In the future, this could query a user preferences table or user_knowledge_base
      return {
        enabled: true,
        frequency: 'normal',
        manualOnly: false
      };
    } catch (error) {
      logger.error('Error getting user title preferences:', { error, userId });
      return {
        enabled: true,
        frequency: 'normal',
        manualOnly: false
      };
    }
  }

  /**
   * Force update a thread title (for manual triggers)
   */
  async forceUpdateTitle(threadId: string, userId: string, orgId: string): Promise<ThreadTitleUpdateResult> {
    try {
      const context = await this.gatherThreadContext(threadId, userId, orgId);
      if (!context) {
        return {
          updated: false,
          reason: 'Could not gather thread context',
          shouldUpdate: false
        };
      }

      const newTitle = await this.generateSmartTitle(context);
      if (!newTitle) {
        return {
          updated: false,
          reason: 'Failed to generate new title',
          shouldUpdate: true
        };
      }

      return await this.applyTitleUpdate(threadId, newTitle, context.messageCount, 'Manual update');

    } catch (error) {
      logger.error('Error force updating thread title:', { error: error instanceof Error ? error.message : String(error), threadId });
      return {
        updated: false,
        reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
        shouldUpdate: false
      };
    }
  }

  /**
   * Get title update statistics for a thread (simplified)
   */
  async getTitleUpdateStats(threadId: string): Promise<{
    messageCount: number;
    lastUpdateTime: string;
    hoursSinceLastUpdate: number;
    currentTitle: string;
    nextUpdateReasons: string[];
  } | null> {
    try {
      const thread = await db.query.chatThreads.findFirst({
        where: eq(chatThreads.id, threadId)
      });

      if (!thread) {
        return null;
      }

      const messageCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId));

      const messageCount = messageCountResult[0]?.count || 0;
      const lastUpdateTime = new Date(thread.updatedAt).toISOString();
      const hoursSinceLastUpdate = (Date.now() - new Date(thread.updatedAt).getTime()) / (1000 * 60 * 60);

      // Check what would trigger next update
      const nextUpdateReasons: string[] = [];
      const preferences = await this.getUserTitlePreferences('', ''); // Default preferences
      
      const threshold = preferences.frequency === 'conservative' ? 30 : 
                       preferences.frequency === 'aggressive' ? 10 : 20;
      
      const messagesUntilThreshold = threshold - (messageCount % threshold);
      if (messagesUntilThreshold > 0) {
        nextUpdateReasons.push(`${messagesUntilThreshold} more messages (${preferences.frequency} frequency)`);
      }

      nextUpdateReasons.push('Intent shift detection');
      nextUpdateReasons.push('Workflow transition');

      return {
        messageCount,
        lastUpdateTime,
        hoursSinceLastUpdate: Math.round(hoursSinceLastUpdate * 10) / 10,
        currentTitle: thread.title,
        nextUpdateReasons
      };

    } catch (error) {
      logger.error('Error getting title update stats:', { error, threadId });
      return null;
    }
  }
}

// Export singleton instance
export const threadTitleService = new ThreadTitleService();
