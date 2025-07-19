import { Router } from 'express';
import { Request, Response } from 'express';
import { ContextAwareChatService } from '../services/contextAwareChatService';
import { authMiddleware } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();
const contextChatService = new ContextAwareChatService();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all threads with context information
router.get('/context-threads', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const threads = await contextChatService.getThreadsWithContext(userId, orgId);
    res.json(threads);

  } catch (error) {
    logger.error('Error fetching context threads:', error);
    res.status(500).json({ 
      error: 'Failed to fetch threads',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get or create global thread
router.post('/global-thread', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const globalThread = await contextChatService.getOrCreateGlobalThread(userId, orgId);
    res.json(globalThread);

  } catch (error) {
    logger.error('Error getting/creating global thread:', error);
    res.status(500).json({ 
      error: 'Failed to get global thread',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create asset-specific thread
router.post('/asset-thread', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;
    const { assetId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    if (!assetId) {
      return res.status(400).json({ error: 'Asset ID is required' });
    }

    const assetThread = await contextChatService.getOrCreateAssetThread(userId, orgId, assetId);
    res.json(assetThread);

  } catch (error) {
    logger.error('Error creating asset thread:', error);
    res.status(500).json({ 
      error: 'Failed to create asset thread',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Switch context for global thread
router.post('/switch-context', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;
    const { threadId, contextType, contextId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    if (!threadId || !contextType) {
      return res.status(400).json({ error: 'Thread ID and context type are required' });
    }

    const result = await contextChatService.switchContext(threadId, contextType, contextId);
    res.json(result);

  } catch (error) {
    logger.error('Error switching context:', error);
    res.status(500).json({ 
      error: 'Failed to switch context',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get thread suggestions based on context
router.get('/thread-suggestions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;
    const { contextType, contextId } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const currentContext = contextType && contextId ? {
      type: contextType as 'asset' | 'workflow',
      id: contextId as string
    } : undefined;

    const suggestions = await contextChatService.getSuggestedThreads(userId, orgId, currentContext);
    res.json(suggestions);

  } catch (error) {
    logger.error('Error getting thread suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to get suggestions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Archive old threads
router.post('/archive-old', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const orgId = req.headers['x-organization-id'] as string;
    const { daysOld = 30 } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const archivedCount = await contextChatService.archiveOldThreads(userId, orgId, daysOld);
    res.json({ 
      message: `Archived ${archivedCount} old threads`,
      archivedCount 
    });

  } catch (error) {
    logger.error('Error archiving old threads:', error);
    res.status(500).json({ 
      error: 'Failed to archive threads',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 