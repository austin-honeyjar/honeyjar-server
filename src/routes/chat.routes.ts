import { Router } from 'express';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { ChatService } from '../services/chat.service';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { chatThreads } from '../db/schema';

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

// Start a new JSON PR workflow
router.post('/json-pr', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const orgId = req.body.orgId || null;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }
    
    const chatService = new ChatService();
    const threadId = await chatService.startJsonPrWorkflow(userId, orgId);
    
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId)
    });
    
    return res.status(201).json({
      status: 'success',
      data: thread
    });
  } catch (error) {
    logger.error('Error creating JSON PR workflow', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create JSON PR workflow'
    });
  }
});

// Send message to JSON PR workflow
router.post('/json-pr/:threadId/messages', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { threadId } = req.params;
    const { content } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
    }
    
    if (!content) {
      return res.status(400).json({
        status: 'error',
        message: 'Message content is required'
      });
    }
    
    const chatService = new ChatService();
    const result = await chatService.processJsonPrMessage(threadId, userId, content);
    
    return res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error('Error processing JSON PR message', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process JSON PR message'
    });
  }
});

export default router; 