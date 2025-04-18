import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { chatController } from '../controllers/chatController';
import { createChatSchema, createThreadSchema, getThreadSchema, deleteThreadSchema } from '../validators/chat.validator';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireOrgRole } from '../middleware/org.middleware';

const router = Router();

// Apply logging middleware to all routes
router.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Apply authentication middleware to all chat routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/chat/messages:
 *   post:
 *     summary: Create a new chat message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - threadId
 *               - content
 *             properties:
 *               threadId:
 *                 type: string
 *                 description: ID of the chat thread
 *                 example: '550e8400-e29b-41d4-a716-446655440000'
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
 *             threadId: '550e8400-e29b-41d4-a716-446655440000'
 *             content: 'Hello, how can I help you today?'
 *             role: 'user'
 *     responses:
 *       201:
 *         description: Message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User does not have required organization role
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.post('/messages', 
  requireOrgRole(['member']),
  validate(createChatSchema), 
  chatController.create
);

/**
 * @swagger
 * /api/v1/chat/threads:
 *   get:
 *     summary: Get all chat threads
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of chat threads
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatThread'
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User does not have required organization role
 *       500:
 *         description: Server error
 */
router.get('/threads', 
  requireOrgRole(['member']),
  chatController.listThreads
);

/**
 * @swagger
 * /api/v1/chat/threads:
 *   post:
 *     summary: Create a new chat thread
 *     tags: [Chat]
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
 *                 description: Title of the chat thread
 *                 example: 'My First Chat Thread'
 *           example:
 *             title: 'My First Chat Thread'
 *     responses:
 *       201:
 *         description: Thread created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatThread'
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User does not have required organization role
 *       500:
 *         description: Server error
 */
router.post('/threads', 
  requireOrgRole(['member']),
  validate(createThreadSchema), 
  chatController.createThread
);

/**
 * @swagger
 * /api/v1/chat/threads/{threadId}:
 *   get:
 *     summary: Get a specific chat thread with its messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *           example: '550e8400-e29b-41d4-a716-446655440000'
 *         description: ID of the chat thread
 *     responses:
 *       200:
 *         description: Chat thread details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatThread'
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User does not have required organization role
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.get('/threads/:threadId', 
  requireOrgRole(['member']),
  validate(getThreadSchema), 
  chatController.getThread
);

/**
 * @swagger
 * /api/v1/chat/threads/{threadId}:
 *   delete:
 *     summary: Delete a chat thread and all its messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *           example: '550e8400-e29b-41d4-a716-446655440000'
 *         description: ID of the chat thread
 *     responses:
 *       200:
 *         description: Thread deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Thread deleted successfully
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User does not have required organization role
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.delete('/threads/:threadId', 
  requireOrgRole(['member']),
  validate(deleteThreadSchema), 
  chatController.deleteThread
);

export default router; 