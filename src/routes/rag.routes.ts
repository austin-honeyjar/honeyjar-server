import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { ragService } from '../services/ragService';
import { enhancedWorkflowService } from '../services/enhancedWorkflowService';
import { fileUploadService } from '../services/fileUploadService';
import logger from '../utils/logger';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    cb(null, uploadDir);
  },
  filename: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const validation = fileUploadService.validateFile({
      filename: file.filename,
      originalname: file.originalname,
      size: 0, // Will be checked after upload
      path: '',
      mimetype: file.mimetype
    });
    
    if (validation.valid) {
      cb(null, true);
    } else {
      cb(null, false); // Use null for error, false to reject file
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

/**
 * POST /api/rag/admin/upload
 * Admin upload for global RAG documents
 */
router.post('/admin/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    const { title, description, contentCategory, tags, uploadedBy } = req.body;

    if (!title || !uploadedBy) {
      await fileUploadService.cleanupFile(req.file.path);
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: title and uploadedBy' 
      });
    }

    // Process the upload
    const result = await fileUploadService.processAdminUpload(
      {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        mimetype: req.file.mimetype,
      },
      {
        title,
        description,
        contentCategory,
        tags: tags ? JSON.parse(tags) : undefined,
      },
      uploadedBy
    );

    if (result.success) {
      res.json({
        success: true,
        documentId: result.documentId,
        message: 'Admin document uploaded and processed successfully',
        filename: req.file.originalname,
      });
    } else {
      await fileUploadService.cleanupFile(req.file.path);
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to process upload'
      });
    }

  } catch (error) {
    logger.error('Error in admin upload:', error);
    if (req.file) {
      await fileUploadService.cleanupFile(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/user/upload
 * User upload for personal RAG documents
 */
router.post('/user/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    const { title, description, contentCategory, tags, userId, orgId, threadId } = req.body;

    if (!title || !userId) {
      await fileUploadService.cleanupFile(req.file.path);
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: title and userId' 
      });
    }

    // Process the upload
    const result = await fileUploadService.processUserUpload(
      {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        mimetype: req.file.mimetype,
      },
      {
        title,
        description,
        contentCategory,
        tags: tags ? JSON.parse(tags) : undefined,
      },
      userId,
      orgId || '',
      threadId
    );

    if (result.success) {
      res.json({
        success: true,
        documentId: result.documentId,
        message: 'User document uploaded and processed successfully',
        filename: req.file.originalname,
      });
    } else {
      await fileUploadService.cleanupFile(req.file.path);
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to process upload'
      });
    }

  } catch (error) {
    logger.error('Error in user upload:', error);
    if (req.file) {
      await fileUploadService.cleanupFile(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rag/documents/:userId
 * Get available RAG documents for a user
 */
router.get('/documents/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { orgId = '', securityLevel = 'internal' } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameter: userId' 
      });
    }

    const documents = await ragService.getAvailableRagDocuments(
      userId,
      orgId as string,
      securityLevel as any
    );

    res.json({
      success: true,
      documents,
      count: documents.length
    });

  } catch (error) {
    logger.error('Error getting RAG documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/search-secure
 * Security-aware content search
 */
router.post('/search-secure', async (req: Request, res: Response) => {
  try {
    const { 
      userId, 
      orgId = '', 
      query, 
      contentTypes = ['conversation', 'asset', 'rag_document'],
      workflowTypes = [], 
      securityLevel = 'internal',
      limit = 10,
      minRelevanceScore = 0.7 
    } = req.body;

    if (!userId || !query) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters: userId and query' 
      });
    }

    const searchResults = await ragService.searchSecureContent(userId, orgId, query, {
      contentTypes,
      workflowTypes,
      securityLevel,
      limit,
      minRelevanceScore
    });

    res.json({
      success: true,
      results: searchResults,
      count: searchResults.length,
      query,
      searchParams: {
        contentTypes,
        workflowTypes,
        securityLevel,
        limit,
        minRelevanceScore
      }
    });

  } catch (error) {
    logger.error('Error searching secure content:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rag/supported-file-types
 * Get supported file types for uploads
 */
router.get('/supported-file-types', async (req: Request, res: Response) => {
  try {
    const supportedTypes = fileUploadService.getSupportedFileTypes();
    
    res.json({
      success: true,
      supportedTypes,
      maxFileSize: '10MB'
    });

  } catch (error) {
    logger.error('Error getting supported file types:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rag/smart-defaults/:userId/:workflowType
 * Get smart defaults for a user and workflow type
 */
router.get('/smart-defaults/:userId/:workflowType', async (req: Request, res: Response) => {
  try {
    const { userId, workflowType } = req.params;
    const { orgId = '' } = req.query;

    if (!userId || !workflowType) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId and workflowType' 
      });
    }

    const smartDefaults = await ragService.getSmartDefaults(
      userId, 
      orgId as string, 
      workflowType
    );

    res.json({
      success: true,
      smartDefaults,
      message: Object.keys(smartDefaults).length > 0 
        ? 'Smart defaults retrieved successfully'
        : 'No smart defaults available for this user/workflow combination'
    });

  } catch (error) {
    logger.error('Error getting smart defaults', { error, userId: req.params.userId });
    res.status(500).json({ 
      error: 'Failed to get smart defaults',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rag/user-knowledge/:userId
 * Get user's knowledge base
 */
router.get('/user-knowledge/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { orgId = '' } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    const userKnowledge = await ragService.getUserKnowledge(userId, orgId as string);

    res.json({
      success: true,
      userKnowledge,
      hasKnowledge: !!userKnowledge
    });

  } catch (error) {
    logger.error('Error getting user knowledge', { error, userId: req.params.userId });
    res.status(500).json({ 
      error: 'Failed to get user knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/user-knowledge/:userId
 * Update user's knowledge base
 */
router.post('/user-knowledge/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { orgId = '', ...knowledgeData } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    await enhancedWorkflowService.updateUserKnowledge(userId, orgId, knowledgeData);

    res.json({
      success: true,
      message: 'User knowledge updated successfully'
    });

  } catch (error) {
    logger.error('Error updating user knowledge', { error, userId: req.params.userId });
    res.status(500).json({ 
      error: 'Failed to update user knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/search
 * Legacy search endpoint (keeping for backward compatibility)
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { 
      userId, 
      orgId = '', 
      query, 
      workflowTypes = [], 
      limit = 10,
      minRelevanceScore = 0.7 
    } = req.body;

    if (!userId || !query) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId and query' 
      });
    }

    const searchResults = await ragService.searchUserContent(userId, orgId, query, {
      contentTypes: ['conversation', 'asset'],
      workflowTypes,
      limit,
      minRelevanceScore
    });

    res.json({
      success: true,
      results: searchResults,
      count: searchResults.length,
      query,
      searchParams: {
        workflowTypes,
        limit,
        minRelevanceScore
      }
    });

  } catch (error) {
    logger.error('Error searching user content', { error, query: req.body.query });
    res.status(500).json({ 
      error: 'Failed to search content',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rag/context/:userId/:workflowType/:stepName
 * Get relevant context for a current workflow step
 */
router.get('/context/:userId/:workflowType/:stepName', async (req: Request, res: Response) => {
  try {
    const { userId, workflowType, stepName } = req.params;
    const { orgId = '', userQuery = '' } = req.query;

    if (!userId || !workflowType || !stepName) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, workflowType, and stepName' 
      });
    }

    const context = await ragService.getRelevantContext(
      userId,
      orgId as string,
      workflowType,
      stepName,
      userQuery as string
    );

    res.json({
      success: true,
      context,
      hasContext: !!(context.relatedConversations.length || context.similarAssets.length || Object.keys(context.userDefaults).length)
    });

  } catch (error) {
    logger.error('Error getting relevant context', { error, params: req.params });
    res.status(500).json({ 
      error: 'Failed to get relevant context',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rag/workflow-suggestions/:userId
 * Get workflow suggestions based on user history
 */
router.get('/workflow-suggestions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { orgId = '' } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    const suggestions = await enhancedWorkflowService.getWorkflowSuggestions(
      userId, 
      orgId as string
    );

    res.json({
      success: true,
      suggestions,
      hasCustomSuggestions: suggestions.recommendedWorkflows.length > 2 // More than default
    });

  } catch (error) {
    logger.error('Error getting workflow suggestions', { error, userId: req.params.userId });
    res.status(500).json({ 
      error: 'Failed to get workflow suggestions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/enhanced-workflow
 * Create a workflow with enhanced context
 */
router.post('/enhanced-workflow', async (req: Request, res: Response) => {
  try {
    const { threadId, templateId, userId, orgId = '' } = req.body;

    if (!threadId || !templateId || !userId) {
      return res.status(400).json({ 
        error: 'Missing required parameters: threadId, templateId, and userId' 
      });
    }

    const workflow = await enhancedWorkflowService.initializeWorkflowWithContext(
      threadId,
      templateId,
      userId,
      orgId
    );

    res.json({
      success: true,
      workflow,
      message: 'Enhanced workflow created successfully'
    });

  } catch (error) {
    logger.error('Error creating enhanced workflow', { error, body: req.body });
    res.status(500).json({ 
      error: 'Failed to create enhanced workflow',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/enhanced-step-response
 * Handle step response with RAG enhancement
 */
router.post('/enhanced-step-response', async (req: Request, res: Response) => {
  try {
    const { stepId, userInput, userId, orgId = '' } = req.body;

    if (!stepId || !userInput || !userId) {
      return res.status(400).json({ 
        error: 'Missing required parameters: stepId, userInput, and userId' 
      });
    }

    const enhancedResponse = await enhancedWorkflowService.handleStepResponseWithRAG(
      stepId,
      userInput,
      userId,
      orgId
    );

    res.json({
      success: true,
      ...enhancedResponse,
      enhanced: true
    });

  } catch (error) {
    logger.error('Error handling enhanced step response', { error, body: req.body });
    res.status(500).json({ 
      error: 'Failed to process enhanced step response',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/store-conversation
 * Manually store a conversation for learning
 */
router.post('/store-conversation', async (req: Request, res: Response) => {
  try {
    const { 
      userId, 
      orgId = '', 
      context, 
      contentText, 
      contentSummary,
      structuredData 
    } = req.body;

    if (!userId || !context || !contentText) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, context, and contentText' 
      });
    }

    const conversationId = await ragService.storeConversation(
      userId,
      orgId,
      context,
      contentText,
      contentSummary,
      structuredData
    );

    res.json({
      success: true,
      conversationId,
      message: 'Conversation stored successfully'
    });

  } catch (error) {
    logger.error('Error storing conversation', { error, body: req.body });
    res.status(500).json({ 
      error: 'Failed to store conversation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/rag/store-asset-history
 * Store asset generation history and feedback
 */
router.post('/store-asset-history', async (req: Request, res: Response) => {
  try {
    const { 
      userId, 
      orgId = '', 
      threadId, 
      workflowId,
      assetData 
    } = req.body;

    if (!userId || !threadId || !assetData) {
      return res.status(400).json({ 
        error: 'Missing required parameters: userId, threadId, and assetData' 
      });
    }

    const assetHistoryId = await ragService.storeAssetHistory(
      userId,
      orgId,
      threadId,
      workflowId,
      assetData
    );

    res.json({
      success: true,
      assetHistoryId,
      message: 'Asset history stored successfully'
    });

  } catch (error) {
    logger.error('Error storing asset history', { error, body: req.body });
    res.status(500).json({ 
      error: 'Failed to store asset history',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/rag/cleanup-cache
 * Clean up expired cache entries
 */
router.delete('/cleanup-cache', async (req: Request, res: Response) => {
  try {
    const cleanedCount = await ragService.cleanupExpiredCache();

    res.json({
      success: true,
      cleanedCount,
      message: `Cleaned up ${cleanedCount} expired cache entries`
    });

  } catch (error) {
    logger.error('Error cleaning up cache', { error });
    res.status(500).json({ 
      error: 'Failed to cleanup cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rag/health
 * RAG system health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Test basic RAG functionality
    const testUser = 'health-check-user';
    const testOrg = 'health-check-org';
    
    // Test user knowledge retrieval (should return null for non-existent user)
    const knowledge = await ragService.getUserKnowledge(testUser, testOrg);
    
    // Test embedding generation with a small text
    const testEmbedding = await ragService.generateEmbedding('test content for health check');
    
    res.json({
      success: true,
      status: 'healthy',
      components: {
        userKnowledge: 'operational',
        embeddings: testEmbedding.length === 1536 ? 'operational' : 'warning',
        database: 'operational',
        fileUpload: 'operational'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('RAG health check failed', { error });
    res.status(500).json({ 
      success: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 