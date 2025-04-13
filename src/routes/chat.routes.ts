import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { chatController } from '../controllers/chatController';
import { createChatSchema, createThreadSchema, getThreadSchema, deleteThreadSchema } from '../validators/chat.validator';
import logger from '../utils/logger';

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

/**
 * @swagger
 * /api/chat/messages:
 *   post:
 *     summary: Create a new chat message
 *     tags: [Chat]
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
 *               content:
 *                 type: string
 *                 description: Message content
 *               role:
 *                 type: string
 *                 enum: [user, assistant]
 *                 default: user
 *                 description: Role of the message sender
 *     responses:
 *       201:
 *         description: Message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.post('/messages', validate(createChatSchema), chatController.create);

/**
 * @swagger
 * /api/chat/threads:
 *   get:
 *     summary: Get all chat threads
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: List of chat threads
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatThread'
 *       500:
 *         description: Server error
 */
router.get('/threads', chatController.listThreads);

/**
 * @swagger
 * /api/chat/threads:
 *   post:
 *     summary: Create a new chat thread
 *     tags: [Chat]
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
 *     responses:
 *       201:
 *         description: Thread created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatThread'
 *       500:
 *         description: Server error
 */
router.post('/threads', chatController.createThread);

/**
 * @swagger
 * /api/chat/threads/{threadId}:
 *   get:
 *     summary: Get a specific chat thread with its messages
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the chat thread
 *     responses:
 *       200:
 *         description: Chat thread details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatThread'
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.get('/threads/:threadId', validate(getThreadSchema), chatController.getThread);

/**
 * @swagger
 * /api/chat/threads/{threadId}:
 *   delete:
 *     summary: Delete a chat thread and all its messages
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
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
 *       404:
 *         description: Thread not found
 *       500:
 *         description: Server error
 */
router.delete('/threads/:threadId', validate(deleteThreadSchema), chatController.deleteThread);

export default router; 