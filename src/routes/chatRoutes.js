import express from 'express';
import { 
  getThreads, 
  createThread, 
  getThreadMessages, 
  sendMessage,
  deleteChatHistory
} from '../controllers/chatController.js';
import { logger } from '../services/logger.js';

const router = express.Router();

// Log all requests
router.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Get all threads for a user
router.get('/threads', getThreads);

// Create a new thread
router.post('/threads', createThread);

// Get messages for a specific thread
router.get('/threads/:userId/:threadId/messages', getThreadMessages);

// Send a message in a thread
router.post('/threads/:userId/:threadId/messages', sendMessage);

// Delete all chat history for a user
router.delete('/history', deleteChatHistory);

export default router; 