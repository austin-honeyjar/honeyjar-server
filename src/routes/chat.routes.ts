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

// REMOVED: Legacy JSON PR endpoints
// These endpoints bypassed Enhanced Service and are no longer needed.
// Modern clients should use the standard /:threadId/messages endpoint
// which routes through Enhanced Service for Press Release workflows.
//
// Removed endpoints:
// - POST /json-pr (use standard workflow creation instead)
// - POST /json-pr/:threadId/messages (use /:threadId/messages instead)

export default router; 