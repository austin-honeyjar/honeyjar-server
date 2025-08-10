import { Request, Response } from 'express';
import { db } from '../db';
import { chatThreads, chatMessages } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import logger from '../utils/logger';
import { CreateChatInput, CreateThreadInput } from '../validators/chat.validator';
import { ChatService } from '../services/chat.service';
import { hybridChatService } from '../services/hybridChat.service';
import { v4 as uuidv4 } from 'uuid';
import { simpleCache } from '../utils/simpleCache';
import { enhancedWorkflowService } from '../services/enhanced-workflow.service'; // Changed from upgradedWorkflowService

export const chatController = {
  // Create a new chat message
  create: async (req: Request, res: Response) => {
    try {
      const { content, role } = req.body as CreateChatInput;
      const { threadId } = req.params;
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!orgId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Organization ID is required'
        });
      }

      // Verify thread exists and belongs to user and organization
      const thread = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId)
        ))
        .limit(1);

      if (!thread.length) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Thread not found or access denied'
        });
      }

      // Create message - doing this explicitly here so we have the exact message object to return to the client
      const [message] = await db.insert(chatMessages)
        .values({
          threadId,
          userId,
          content,
          role
        })
        .returning();

      // Handle the message in the workflow
      const workflowService = enhancedWorkflowService; // Changed from enhancedWorkflowService
      const chatService = new ChatService();
      
      // Pass user context to enable enhanced processing with RAG context injection
      const response = await chatService.handleUserMessageNoCreate(threadId, content, userId, orgId);

      // Log workflow state change
      const workflow = await workflowService.getWorkflowByThreadId(threadId);
      logger.info('Workflow state updated', {
        threadId,
        workflowId: workflow?.id,
        currentStep: workflow?.currentStepId,
        stepStatus: workflow?.steps?.find(s => s.id === workflow?.currentStepId)?.status,
        totalSteps: workflow?.steps?.length,
        completedSteps: workflow?.steps?.filter(s => s.status === 'complete')?.length
      });

      logger.info('Created chat message', { messageId: message.id, threadId });

      // Invalidate thread cache
      try {
        simpleCache.del(`thread:${threadId}`);
        simpleCache.del(`threads:${userId}:${orgId}`);
        logger.info('Invalidated caches for thread and thread list', { threadId, userId, orgId });
      } catch (cacheError) {
        logger.error('Error invalidating cache', { error: cacheError });
      }

      res.status(201).json({
        message,
        response
      });
    } catch (error) {
      logger.error('Error creating chat message:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create chat message'
      });
    }
  },

  // New queue-based chat message creation (non-blocking)
  createWithQueues: async (req: Request, res: Response) => {
    try {
      const { content, role } = req.body as CreateChatInput;
      const { threadId } = req.params;
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!orgId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Organization ID is required'
        });
      }

      // Verify thread exists and belongs to user and organization
      const thread = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId)
        ))
        .limit(1);

      if (!thread.length) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Thread not found or access denied'
        });
      }

      // Use hybrid service for queue-based processing
      const result = await hybridChatService.handleUserMessageWithQueues(
        threadId, 
        content, 
        userId, 
        orgId
      );

      logger.info('✅ Queue-based chat message processing initiated', { 
        messageId: result.immediate.messageId, 
        threadId,
        batchId: result.tracking.batchId
      });

      // Invalidate thread cache
      try {
        simpleCache.del(`thread:${threadId}`);
        simpleCache.del(`threads:${userId}:${orgId}`);
        logger.info('Invalidated caches for thread and thread list', { threadId, userId, orgId });
      } catch (cacheError) {
        logger.error('Error invalidating cache', { error: cacheError });
      }

      res.status(202).json({
        status: 'accepted',
        message: 'Processing started',
        data: result
      });
      
    } catch (error) {
      logger.error('Error in queue-based chat processing:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start chat processing'
      });
    }
  },

  // Get results from queued processing
  getBatchResults: async (req: Request, res: Response) => {
    try {
      const { batchId } = req.params;
      
      if (!batchId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Batch ID is required'
        });
      }

      const results = await hybridChatService.getBatchResults(batchId);
      
      res.json({
        batchId,
        ...results
      });
      
    } catch (error) {
      logger.error('Error retrieving batch results:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve batch results'
      });
    }
  },

  // List all threads for a user
  listThreads: async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!orgId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Organization ID is required'
        });
      }

      const threads = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId)
        ))
        .orderBy(chatThreads.createdAt);

      logger.info('Retrieved chat threads', { userId, orgId, count: threads.length });
      res.json(threads);
    } catch (error) {
      logger.error('Error listing chat threads:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list chat threads'
      });
    }
  },

  // Get a specific thread with its messages
  getThread: async (req: Request, res: Response) => {
    try {
      const { threadId } = req.params;
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!orgId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Organization ID is required'
        });
      }

      // Get thread
      const [thread] = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId)
        ))
        .limit(1);

      if (!thread) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Thread not found or access denied'
        });
      }

      // Get messages
      const messages = await db.select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(chatMessages.createdAt);

      // Get workflow state
      const workflowService = enhancedWorkflowService; // Changed from enhancedWorkflowService
      const workflow = await workflowService.getWorkflowByThreadId(threadId);

      // Get current step information including step type
      let currentStepInfo = null;
      if (workflow?.currentStepId) {
        const currentStep = workflow.steps.find(s => s.id === workflow.currentStepId);
        if (currentStep) {
          currentStepInfo = {
            id: currentStep.id,
            name: currentStep.name,
            status: currentStep.status,
            stepType: currentStep.stepType,
            order: currentStep.order
          };
        }
      }

      // Log workflow state
      logger.info('Retrieved workflow state', {
        threadId,
        workflowId: workflow?.id,
        currentStep: workflow?.currentStepId,
        stepStatus: workflow?.steps?.find(s => s.id === workflow?.currentStepId)?.status,
        totalSteps: workflow?.steps?.length,
        completedSteps: workflow?.steps?.filter(s => s.status === 'complete')?.length
      });

      logger.info('Retrieved chat thread', { threadId, messageCount: messages.length });
      res.json({ 
        ...thread, 
        messages, 
        workflow,
        currentStepInfo 
      });
    } catch (error) {
      logger.error('Error getting chat thread:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get chat thread'
      });
    }
  },

  // Create a new thread
  createThread: async (req: Request, res: Response) => {
    try {
      const { title } = req.body as CreateThreadInput;
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!orgId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Organization ID is required'
        });
      }

      // Create thread
      const [thread] = await db.insert(chatThreads)
        .values({
          id: uuidv4(),
          title,
          userId,
          orgId
        })
        .returning();

      // No automatic workflow creation - let the intent layer handle this on demand
      logger.info('Created chat thread - workflows will be created on demand via intent layer', { 
        threadId: thread.id 
      });
      
      res.status(201).json({
        thread
      });

      // Invalidate thread list cache for user/org
      simpleCache.del(`threads:${userId}:${orgId}`);
    } catch (error) {
      logger.error('Error creating chat thread:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create chat thread'
      });
    }
  },

  // Delete a thread and its messages
  deleteThread: async (req: Request, res: Response) => {
    try {
      const { threadId } = req.params;
      const userId = req.user?.id;
      const orgId = req.headers['x-organization-id'] as string;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User ID not found in request'
        });
      }

      if (!orgId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Organization ID is required'
        });
      }

      // Verify thread exists and belongs to user and organization
      const [thread] = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, userId),
          eq(chatThreads.orgId, orgId)
        ))
        .limit(1);

      if (!thread) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Thread not found or access denied'
        });
      }

      // Delete any associated workflow
      const workflowService = enhancedWorkflowService; // Changed from enhancedWorkflowService
      const workflow = await workflowService.getWorkflowByThreadId(threadId);
      if (workflow) {
        await workflowService.deleteWorkflow(workflow.id);
        logger.info('Deleted associated workflow', { workflowId: workflow.id, threadId });
      }

      // Delete messages first (due to foreign key constraint)
      await db.delete(chatMessages)
        .where(eq(chatMessages.threadId, threadId));

      // Delete thread
      await db.delete(chatThreads)
        .where(eq(chatThreads.id, threadId));

      logger.info('Deleted chat thread', { threadId, userId, orgId });

      // Invalidate caches
      simpleCache.del(`thread:${threadId}`);
      simpleCache.del(`threads:${userId}:${orgId}`);

      res.status(200).json({ message: 'Thread deleted successfully' });
    } catch (error) {
      logger.error('Error deleting chat thread:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete chat thread'
      });
    }
  }
}; 