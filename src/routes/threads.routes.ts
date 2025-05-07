import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import logger from '../utils/logger';
import { AuthRequest } from '../types/request';
import { Thread } from '../types/thread';
import { db } from '../db';
import { chatThreads, chatMessages, workflows, workflowSteps } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { validate } from '../middleware/validation.middleware';
import { createChatSchema } from '../validators/chat.validator';
import { chatController } from '../controllers/chatController';
import { requireOrgRole } from '../middleware/org.middleware';
import { WorkflowDBService } from '../services/workflowDB.service';
import { ChatService } from '../services/chat.service';
import { WorkflowService } from '../services/workflow.service';

const router = Router();

// Apply auth middleware to all thread routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/threads:
 *   get:
 *     summary: Get all threads for the current user
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of threads
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 threads:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Thread'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      logger.error('User not found in request', {
        path: req.path,
        method: req.method,
        headers: {
          authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'missing'
        }
      });
      return res.status(401).json({ 
        status: 'error', 
        message: 'User not authenticated' 
      });
    }

    const orgId = Array.isArray(req.headers['x-organization-id']) 
      ? req.headers['x-organization-id'][0]
      : req.headers['x-organization-id'];
    
    if (!orgId) {
      return res.status(400).json({
        status: 'error',
        message: 'Organization ID is required'
      });
    }

    logger.info('Getting threads for user:', { 
      userId: req.user.id,
      orgId,
      sessionId: req.user.sessionId,
      permissions: req.user.permissions
    });
    
    // Try to get threads with org_id first
    let threads = await db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.userId, req.user.id),
          eq(chatThreads.orgId, orgId)
        )
      )
      .orderBy(chatThreads.createdAt);

    logger.info('Returning threads:', { 
      userId: req.user.id,
      orgId,
      count: threads.length
    });
    
    res.json({ threads });
  } catch (error) {
    logger.error('Error getting threads:', { error });
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get threads' 
    });
  }
});

/**
 * @swagger
 * /api/v1/threads/{id}:
 *   get:
 *     summary: Get a specific thread by ID
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     responses:
 *       200:
 *         description: Thread details with messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 thread:
 *                   $ref: '#/components/schemas/Thread'
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      logger.error('User not found in request', {
        path: req.path,
        method: req.method,
        headers: {
          authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'missing'
        }
      });
      return res.status(401).json({ 
        status: 'error', 
        message: 'User not authenticated' 
      });
    }

    const threadId = req.params.id;
    const orgId = Array.isArray(req.headers['x-organization-id']) 
      ? req.headers['x-organization-id'][0]
      : req.headers['x-organization-id'];
    
    if (!threadId) {
      return res.status(400).json({
        status: 'error',
        message: 'Thread ID is required'
      });
    }

    if (!orgId) {
      return res.status(400).json({
        status: 'error',
        message: 'Organization ID is required'
      });
    }

    logger.info('Getting thread:', { 
      userId: req.user.id,
      threadId,
      orgId,
      sessionId: req.user.sessionId,
      permissions: req.user.permissions
    });
    
    // Try to get thread with org_id first
    let thread = await db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, req.user.id),
          eq(chatThreads.orgId, orgId)
        )
      )
      .limit(1);

    if (thread.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Thread not found or access denied'
      });
    }
    
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(chatMessages.createdAt);
    
    logger.info('Returning thread:', { 
      userId: req.user.id,
      threadId,
      orgId
    });
    
    res.json({ thread: thread[0], messages });
  } catch (error) {
    logger.error('Error getting thread:', { error });
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get thread' 
    });
  }
});

/**
 * @swagger
 * /api/v1/threads:
 *   post:
 *     summary: Create a new chat thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the new thread
 *     responses:
 *       201:
 *         description: Thread created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 thread:
 *                   $ref: '#/components/schemas/Thread'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      logger.error('User not found in request', {
        path: req.path,
        method: req.method,
        headers: {
          authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'missing'
        }
      });
      return res.status(401).json({ 
        status: 'error', 
        message: 'User not authenticated' 
      });
    }

    const { title } = req.body;
    const orgId = Array.isArray(req.headers['x-organization-id']) 
      ? req.headers['x-organization-id'][0]
      : req.headers['x-organization-id'];
    
    if (!title) {
      return res.status(400).json({
        status: 'error',
        message: 'Title is required'
      });
    }

    if (!orgId) {
      return res.status(400).json({
        status: 'error',
        message: 'Organization ID is required'
      });
    }

    logger.info('Creating new thread:', { 
      userId: req.user.id,
      orgId,
      title,
      sessionId: req.user.sessionId,
      permissions: req.user.permissions
    });
    
    // Create the thread in the database
    const [thread] = await db
      .insert(chatThreads)
      .values({
        userId: req.user.id,
        orgId: orgId,
        title: title
      })
      .returning();
    
    // Initialize the base workflow
    const workflowService = new WorkflowService();
    const chatService = new ChatService();
    
    // Get the base workflow template
    const baseTemplate = await workflowService.getTemplateByName('Base Workflow');
    if (!baseTemplate) {
      logger.error('Base workflow template not found');
      return res.status(500).json({ 
        status: 'error', 
        message: 'Failed to initialize workflow - template not found' 
      });
    }
    
    // Create the base workflow - this sends the initial AI message
    await workflowService.createWorkflow(thread.id, baseTemplate.id);
    
    logger.info('Thread created with base workflow:', { 
      userId: req.user.id,
      orgId,
      threadId: thread.id
    });
    
    res.status(201).json({ thread });
  } catch (error) {
    logger.error('Error creating thread:', { error });
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to create thread' 
    });
  }
});

/**
 * @swagger
 * /api/v1/threads/{id}:
 *   delete:
 *     summary: Delete a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Thread ID
 *     responses:
 *       200:
 *         description: Thread deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      logger.error('User not found in request', {
        path: req.path,
        method: req.method,
        headers: {
          authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'missing'
        }
      });
      return res.status(401).json({ 
        status: 'error', 
        message: 'User not authenticated' 
      });
    }

    const threadId = req.params.id;
    if (!threadId) {
      return res.status(400).json({
        status: 'error',
        message: 'Thread ID is required'
      });
    }

    logger.info('Deleting thread:', { 
      userId: req.user.id,
      threadId,
      sessionId: req.user.sessionId,
      permissions: req.user.permissions
    });

    try {
      // 1. Get all workflows for this thread
      const threadWorkflows = await db
        .select()
        .from(workflows)
        .where(eq(workflows.threadId, threadId));
      
      logger.info(`Found ${threadWorkflows.length} workflows to delete for thread ${threadId}`);

      // 2. Delete each workflow (this will also delete associated steps)
      const workflowDbService = new WorkflowDBService();
      for (const workflow of threadWorkflows) {
        await workflowDbService.deleteWorkflow(workflow.id);
      }
    } catch (workflowError) {
      logger.error('Error deleting associated workflows:', { workflowError });
      // Continue with thread deletion even if workflow deletion fails
    }

    // 3. Next delete all messages in the thread
    await db
      .delete(chatMessages)
      .where(eq(chatMessages.threadId, threadId));

    // 4. Finally delete the thread itself
    const result = await db
      .delete(chatThreads)
      .where(
        and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, req.user.id)
        )
      )
      .returning();

    if (result.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Thread not found'
      });
    }

    logger.info('Thread deleted:', { 
      userId: req.user.id,
      threadId
    });

    res.json({ 
      status: 'success',
      message: 'Thread deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting thread:', { error });
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to delete thread' 
    });
  }
});

/**
 * @swagger
 * /api/v1/threads/{threadId}/messages:
 *   post:
 *     summary: Create a new chat message in a thread
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the chat thread
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message content
 *                 example: 'Hello, how can I help you today?'
 *               role:
 *                 type: string
 *                 enum: [user, assistant]
 *                 default: user
 *                 description: Role of the message sender
 *           example:
 *             content: 'Hello, how can I help you today?'
 *             role: 'user'
 *     responses:
 *       201:
 *         description: Message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *                 response:
 *                   type: string
 *                   description: Assistant's response to the message
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User does not have required organization role
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.post('/:threadId/messages', 
  requireOrgRole(['admin', 'member']),
  validate(createChatSchema), 
  chatController.create
);

export default router; 