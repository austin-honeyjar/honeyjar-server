import { Router } from 'express';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { ChatService } from '../services/chat.service';
import { hybridChatService } from '../services/hybridChat.service';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { chatThreads } from '../db/schema';
import { ComprehensiveChatController } from '../controllers/comprehensiveChatController';
import { HealthController } from '../controllers/health.controller';

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

// Public endpoints (BEFORE auth middleware) - no authentication required
router.post('/test/queue-simple', async (req, res) => {
  try {
    console.log('🧪 Simple queue test endpoint hit');
    
    const testMessage = req.body.message || 'Simple test of queue system';
    const result = await hybridChatService.handleUserMessageWithQueues(
      '550e8400-e29b-41d4-a716-446655440000', // test thread ID
      testMessage,
      'test-user-123', // test user ID
      'test-org-456'   // test org ID
    );
    
    console.log('✅ Queue test successful:', result.tracking.batchId);
    
    res.json({
      success: true,
      message: 'Queue test completed successfully',
      batchId: result.tracking.batchId,
      jobIds: result.tracking.jobIds,
      immediate: result.immediate
    });
  } catch (error) {
    console.error('❌ Queue test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Performance monitoring endpoints (public for testing)
router.get('/system/health', HealthController.basicHealth);
router.get('/system/health/detailed', HealthController.detailedHealth);
router.get('/system/metrics', HealthController.getMetrics);
router.get('/system/alerts', HealthController.getAlerts);
router.get('/jobs/queue-stats', ComprehensiveChatController.getQueueStats);

// Apply authentication middleware to all other chat routes
router.use(authMiddleware);

const chatService = new ChatService();

// Create a new chat thread
router.post('/threads', async (req, res) => {
  try {
    const { title } = req.body;
    const userId = req.user?.id || 'anonymous';
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const thread = await chatService.createThread(userId, title);
    
    res.json({ thread });
  } catch (error) {
    logger.error('Error creating thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// Get thread messages
router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const messages = await chatService.getThreadMessages(threadId);
    
    res.json({ messages });
  } catch (error) {
    logger.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message to a thread (non-streaming) - ORIGINAL BLOCKING VERSION
router.post('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id || 'anonymous';
    const orgId = Array.isArray(req.headers['x-organization-id'])
      ? req.headers['x-organization-id'][0] 
      : req.headers['x-organization-id'] || '';
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const response = await chatService.handleUserMessage(threadId, content);
    
    res.json({ response });
  } catch (error) {
    logger.error('Error handling message:', error);
    res.status(500).json({ error: 'Failed to handle message' });
  }
});

// Send a message to a thread (queue-based, non-blocking) - NEW PERFORMANCE VERSION
router.post('/threads/:threadId/messages/queued', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id || 'anonymous';
    const orgId = Array.isArray(req.headers['x-organization-id'])
      ? req.headers['x-organization-id'][0] 
      : req.headers['x-organization-id'] || '';
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Use hybrid service for queue-based processing
    const result = await hybridChatService.handleUserMessageWithQueues(
      threadId, 
      content, 
      userId, 
      orgId
    );
    
    res.status(202).json({
      status: 'accepted',
      message: 'Processing started',
      data: result
    });
  } catch (error) {
    logger.error('Error starting queued message processing:', error);
    res.status(500).json({ error: 'Failed to start message processing' });
  }
});

// Get results from batch processing
router.get('/batch/:batchId/results', async (req, res) => {
  try {
    const { batchId } = req.params;
    
    const results = await hybridChatService.getBatchResults(batchId);
    
    res.json({
      batchId,
      ...results
    });
  } catch (error) {
    logger.error('Error retrieving batch results:', error);
    res.status(500).json({ error: 'Failed to retrieve batch results' });
  }
});

// Stream a message to a thread (Server-Sent Events)
router.post('/threads/:threadId/messages/stream', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id || 'anonymous';
    const orgId = Array.isArray(req.headers['x-organization-id'])
      ? req.headers['x-organization-id'][0] 
      : req.headers['x-organization-id'] || '';
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    // Send initial connection event
    res.write('data: {"type": "connected", "data": {"threadId": "' + threadId + '"}}\n\n');

    logger.info('Starting streaming chat response', {
      threadId,
      userId: typeof userId === 'string' ? userId.substring(0, 8) : 'anonymous',
      contentLength: content.length
    });

    try {
      let chunkCount = 0;
      let lastChunkTime = Date.now();
      
      // Stream the response with improved error handling
      for await (const chunk of chatService.handleUserMessageStream(threadId, content, userId, orgId)) {
        chunkCount++;
        const now = Date.now();
        
        // Format as Server-Sent Events with enhanced metadata
        const eventData = JSON.stringify({
          type: chunk.type,
          data: chunk.data,
          timestamp: new Date().toISOString(),
          streamingMeta: {
            chunkIndex: chunkCount,
            timeSinceLastChunk: now - lastChunkTime
          }
        });
        
        res.write(`data: ${eventData}\n\n`);
        lastChunkTime = now;
        
        // Force flush for better streaming performance
        if ('flush' in res && typeof res.flush === 'function') {
          (res as any).flush();
        }
        
        // If there's an error, close the stream
        if (chunk.type === 'error') {
          logger.error('Streaming error:', chunk.data);
          res.write('data: {"type": "done", "data": {"error": true}}\n\n');
          res.end();
          return;
        }
        
        // If workflow is complete, close the stream
        if (chunk.type === 'workflow_complete') {
          res.write('data: {"type": "done", "data": {"completed": true}}\n\n');
          res.end();
          return;
        }
      }
      
      logger.info('📊 Streaming metrics', {
        threadId: threadId.substring(0, 8),
        totalChunks: chunkCount,
        success: true
      });
      
      // Send final completion message
      res.write(`data: ${JSON.stringify({
        type: 'ai_response',
        data: {
          content: '_✅ Request completed successfully._',
          isComplete: true
        },
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      // Send completion event
      res.write('data: {"type": "done", "data": {"success": true}}\n\n');
      res.end();
      
      logger.info('Streaming chat response completed', {
        threadId,
                 userId: typeof userId === 'string' ? userId.substring(0, 8) : 'anonymous'
      });
      
    } catch (streamError) {
      logger.error('Error in streaming response:', streamError);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: { error: 'Streaming failed', message: streamError instanceof Error ? streamError.message : 'Unknown error' },
        timestamp: new Date().toISOString()
      })}\n\n`);
      res.end();
    }

  } catch (error) {
    logger.error('Error starting stream:', error);
    
    // If headers haven't been sent yet, send regular error response
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start stream' });
    } else {
      // If streaming has started, send error event and close
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: { error: 'Stream initialization failed' },
        timestamp: new Date().toISOString()
      })}\n\n`);
      res.end();
    }
  }
});

// Handle client disconnection
router.use('/threads/:threadId/messages/stream', (req, res, next) => {
  req.on('close', () => {
    logger.info('Client disconnected from streaming endpoint', {
      threadId: req.params.threadId,
             userId: req.user?.id ? req.user.id.substring(0, 8) : 'anonymous'
    });
  });
  next();
});

// REMOVED: Legacy JSON PR endpoints
// These endpoints bypassed Enhanced Service and are no longer needed.
// Modern clients should use the standard /:threadId/messages endpoint
// which routes through Enhanced Service for Press Release workflows.
//
// Removed endpoints:
// - POST /json-pr (use standard workflow creation instead)
// - POST /json-pr/:threadId/messages (use /:threadId/messages instead)

// ========================================
// 🚀 COMPREHENSIVE QUEUE-BASED ENDPOINTS
// ========================================

// Non-blocking comprehensive chat endpoint with queue-based processing
router.post('/comprehensive', ComprehensiveChatController.chat);

// Job status and management endpoints (using actual controller methods)
router.post('/jobs/status', ComprehensiveChatController.getComprehensiveStatus);
router.post('/jobs/cancel', ComprehensiveChatController.cancelJobs);

// Authenticated performance monitoring endpoints
router.post('/system/alerts/:alertId/acknowledge', HealthController.acknowledgeAlert);

export default router; 