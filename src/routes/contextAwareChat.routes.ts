import { Router, Request, Response } from 'express';
import { ContextAwareChatService, ThreadContext } from '../services/contextAwareChatService';
import { WorkflowSecurityService } from '../services/workflowSecurityService';
import logger from '../utils/logger';

const router = Router();
const contextChatService = new ContextAwareChatService();
const securityService = new WorkflowSecurityService();

/**
 * GET/POST /api/chat/global-thread
 * Get or create a global session thread for the user
 */
router.post('/global-thread', async (req: Request, res: Response) => {
  try {
    const { userId, orgId } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required field: userId' 
      });
    }

    const globalThread = await contextChatService.getOrCreateGlobalThread(
      userId, 
      orgId || ''
    );

    logger.info(`Global thread requested for user ${userId}: ${globalThread.id}`);

    res.json({
      success: true,
      thread: globalThread
    });

  } catch (error) {
    logger.error('Error in /global-thread:', error);
    res.status(500).json({ 
      error: 'Failed to get or create global thread',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/chat/asset-thread
 * Create an asset-specific thread
 */
router.post('/asset-thread', async (req: Request, res: Response) => {
  try {
    const { userId, orgId, assetId, assetName } = req.body;

    if (!userId || !assetId || !assetName) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, assetId, assetName' 
      });
    }

    const assetThread = await contextChatService.createAssetThread(
      userId,
      orgId || '',
      assetId,
      assetName
    );

    logger.info(`Asset thread created for user ${userId}, asset ${assetId}: ${assetThread.id}`);

    res.json({
      success: true,
      thread: assetThread
    });

  } catch (error) {
    logger.error('Error in /asset-thread:', error);
    res.status(500).json({ 
      error: 'Failed to create asset thread',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/chat/switch-context
 * Switch context for a global thread
 */
router.post('/switch-context', async (req: Request, res: Response) => {
  try {
    const { threadId, context } = req.body;

    if (!threadId || !context) {
      return res.status(400).json({ 
        error: 'Missing required fields: threadId, context' 
      });
    }

    const threadContext: ThreadContext = {
      contextType: context.contextType,
      contextId: context.contextId,
      metadata: context.metadata
    };

    await contextChatService.switchGlobalThreadContext(threadId, threadContext);

    logger.info(`Context switched for thread ${threadId}:`, threadContext);

    res.json({
      success: true,
      message: 'Context switched successfully'
    });

  } catch (error) {
    logger.error('Error in /switch-context:', error);
    res.status(500).json({ 
      error: 'Failed to switch context',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/chat/context-threads
 * Get categorized threads for a user
 */
router.get('/context-threads', async (req: Request, res: Response) => {
  try {
    const { userId, contextType, contextId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    const currentContext: ThreadContext | undefined = contextType ? {
      contextType: contextType as 'asset' | 'workflow',
      contextId: contextId as string
    } : undefined;

    const categorizedThreads = await contextChatService.getCategorizedThreads(
      userId as string,
      currentContext
    );

    logger.info(`Categorized threads retrieved for user ${userId}`);

    res.json({
      success: true,
      threads: categorizedThreads
    });

  } catch (error) {
    logger.error('Error in /context-threads:', error);
    res.status(500).json({ 
      error: 'Failed to get categorized threads',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/chat/thread-suggestions
 * Get context-based thread suggestions
 */
router.get('/thread-suggestions', async (req: Request, res: Response) => {
  try {
    const { userId, contextType, contextId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    const context: ThreadContext | undefined = contextType ? {
      contextType: contextType as 'asset' | 'workflow',
      contextId: contextId as string
    } : undefined;

    const suggestions = await contextChatService.getThreadSuggestions(
      userId as string,
      context
    );

    logger.info(`Thread suggestions generated for user ${userId}: ${suggestions.length} suggestions`);

    res.json({
      success: true,
      suggestions
    });

  } catch (error) {
    logger.error('Error in /thread-suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to get thread suggestions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/chat/archive-old
 * Archive old threads for a user
 */
router.post('/archive-old', async (req: Request, res: Response) => {
  try {
    const { userId, daysOld = 30 } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required field: userId' 
      });
    }

    const archivedCount = await contextChatService.archiveOldThreads(
      userId,
      parseInt(daysOld)
    );

    logger.info(`Archived ${archivedCount} old threads for user ${userId}`);

    res.json({
      success: true,
      archivedCount,
      message: `Archived ${archivedCount} old threads`
    });

  } catch (error) {
    logger.error('Error in /archive-old:', error);
    res.status(500).json({ 
      error: 'Failed to archive old threads',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/chat/workflow-security
 * Get security information for a workflow
 */
router.get('/workflow-security', async (req: Request, res: Response) => {
  try {
    const { workflowName } = req.query;

    if (!workflowName) {
      return res.status(400).json({ 
        error: 'Missing required parameter: workflowName' 
      });
    }

    const securityConfig = securityService.getWorkflowSecurity(workflowName as string);
    const auditInfo = securityService.getSecurityAuditInfo(workflowName as string);

    logger.info(`Security info requested for workflow: ${workflowName}`);

    res.json({
      success: true,
      security: securityConfig,
      audit: auditInfo
    });

  } catch (error) {
    logger.error('Error in /workflow-security:', error);
    res.status(500).json({ 
      error: 'Failed to get workflow security info',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/chat/validate-workflow-switch
 * Validate if a workflow switch is allowed
 */
router.post('/validate-workflow-switch', async (req: Request, res: Response) => {
  try {
    const { fromWorkflow, toWorkflow } = req.body;

    if (!fromWorkflow || !toWorkflow) {
      return res.status(400).json({ 
        error: 'Missing required fields: fromWorkflow, toWorkflow' 
      });
    }

    const switchResult = securityService.validateWorkflowSwitch(fromWorkflow, toWorkflow);

    logger.info(`Workflow switch validation: ${fromWorkflow} → ${toWorkflow} = ${switchResult.allowed}`);

    res.json({
      success: true,
      validation: switchResult
    });

  } catch (error) {
    logger.error('Error in /validate-workflow-switch:', error);
    res.status(500).json({ 
      error: 'Failed to validate workflow switch',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/chat/open-workflows
 * Get list of all open (AI-safe) workflows
 */
router.get('/open-workflows', async (req: Request, res: Response) => {
  try {
    const openWorkflows = securityService.getOpenWorkflows();

    logger.info(`Open workflows requested: ${openWorkflows.length} workflows`);

    res.json({
      success: true,
      workflows: openWorkflows
    });

  } catch (error) {
    logger.error('Error in /open-workflows:', error);
    res.status(500).json({ 
      error: 'Failed to get open workflows',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 