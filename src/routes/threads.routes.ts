import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import logger from '../utils/logger';
import { AuthRequest } from '../types/request';
import { Thread } from '../types/thread';
import { db } from '../db';
import { chatThreads } from '../db/schema';
import { chatMessages } from '../db/schema';
import { eq, and } from 'drizzle-orm';

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

    logger.info('Getting threads for user:', { 
      userId: req.user.id,
      sessionId: req.user.sessionId,
      permissions: req.user.permissions
    });
    
    const threads = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.userId, req.user.id))
      .orderBy(chatThreads.createdAt);
    
    logger.info('Returning threads:', { 
      userId: req.user.id,
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
    if (!threadId) {
      return res.status(400).json({
        status: 'error',
        message: 'Thread ID is required'
      });
    }

    logger.info('Getting thread:', { 
      userId: req.user.id,
      threadId,
      sessionId: req.user.sessionId,
      permissions: req.user.permissions
    });
    
    const thread = await db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.id, threadId),
          eq(chatThreads.userId, req.user.id)
        )
      )
      .limit(1);
    
    if (thread.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Thread not found'
      });
    }
    
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(chatMessages.createdAt);
    
    logger.info('Returning thread:', { 
      userId: req.user.id,
      threadId
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
    if (!title) {
      return res.status(400).json({
        status: 'error',
        message: 'Title is required'
      });
    }

    logger.info('Creating new thread:', { 
      userId: req.user.id,
      title,
      sessionId: req.user.sessionId,
      permissions: req.user.permissions
    });
    
    const [thread] = await db
      .insert(chatThreads)
      .values({
        userId: req.user.id,
        title: title
      })
      .returning();
    
    logger.info('Thread created:', { 
      userId: req.user.id,
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

    // First delete all messages in the thread
    await db
      .delete(chatMessages)
      .where(eq(chatMessages.threadId, threadId));

    // Then delete the thread
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

export default router; 