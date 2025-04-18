import { Request, Response } from 'express';
import { db } from '../db';
import { chatMessages, chatThreads } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';
import { CreateChatInput, CreateThreadInput } from '../validators/chat.validator';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowService } from '../services/workflow.service';
import { ChatService } from '../services/chat.service';

// Temporary test user ID for development
const TEST_USER_ID = 'test_user_123';

export const chatController = {
  
  // Create a new chat message
  create: async (req: Request, res: Response) => {
    try {
      const { threadId, content, role } = req.body as CreateChatInput;
      const userId = TEST_USER_ID;

      // Verify thread exists and belongs to user
      const thread = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, userId)
        ))
        .limit(1);

      if (!thread.length) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Thread not found or access denied'
        });
      }

      // Create message
      const [message] = await db.insert(chatMessages)
        .values({
          threadId,
          userId,
          content,
          role
        })
        .returning();

      // Handle the message in the workflow
      const workflowService = new WorkflowService();
      const chatService = new ChatService();
      const response = await chatService.handleUserMessage(threadId, content);

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

  // List all threads for a user
  listThreads: async (req: Request, res: Response) => {
    try {
      const userId = TEST_USER_ID;
      const threads = await db.select()
        .from(chatThreads)
        .where(eq(chatThreads.userId, userId))
        .orderBy(chatThreads.createdAt);

      logger.info('Retrieved chat threads', { userId, count: threads.length });
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
      const userId = TEST_USER_ID;

      // Get thread
      const [thread] = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, userId)
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
      const workflowService = new WorkflowService();
      const workflow = await workflowService.getWorkflowByThreadId(threadId);

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
      res.json({ ...thread, messages, workflow });
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
      const userId = TEST_USER_ID;

      // Create thread
      const [thread] = await db.insert(chatThreads)
        .values({
          id: uuidv4(),
          title,
          userId
        })
        .returning();

      // Initialize workflow for the thread
      const workflowService = new WorkflowService();
      const chatService = new ChatService();

      // Start a new workflow
      const template = await workflowService.getTemplateByName("Launch Announcement");
      if (!template) {
        throw new Error("Template not found");
      }

      const workflow = await workflowService.createWorkflow(thread.id, template.id);
      const nextPrompt = await chatService.handleUserMessage(thread.id, "I want to create a launch announcement");

      // Log workflow initialization
      logger.info('Workflow initialized', {
        threadId: thread.id,
        workflowId: workflow.id,
        templateId: template.id,
        initialStep: workflow.currentStepId,
        totalSteps: workflow.steps.length
      });

      logger.info('Created chat thread and workflow', { threadId: thread.id, workflowId: workflow.id });
      res.status(201).json({
        thread,
        workflow,
        nextPrompt
      });
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
      const userId = TEST_USER_ID;

      // Verify thread exists and belongs to user
      const [thread] = await db.select()
        .from(chatThreads)
        .where(and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, userId)
        ))
        .limit(1);

      if (!thread) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Thread not found or access denied'
        });
      }

      // Delete any associated workflow
      const workflowService = new WorkflowService();
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

      logger.info('Deleted chat thread', { threadId, userId });
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