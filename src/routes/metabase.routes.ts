import { Router } from 'express';
import { MetabaseService } from '../services/metabase.service';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  validateRequest, 
  sanitizeInput, 
  articleSearchSchema, 
  searchArticlesSchema,
  revokedArticlesSchema,
  complianceClicksSchema
} from '../middleware/validation.middleware';
import { 
  articlesRateLimit, 
  revokedRateLimit
} from '../middleware/rateLimiting.middleware';

const router = Router();
const metabaseService = new MetabaseService();

/**
 * @openapi
 * /api/v1/metabase/articles:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Get recent articles (basic)
 *     description: |
 *       Fetch recent articles from Metabase API - basic endpoint for article retrieval.
 *       
 *       **Rate Limiting:** Minimum 20 seconds between calls. High volume customers should call every 30 seconds.
 *       **Note:** This endpoint retrieves recent articles without search functionality.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 100
 *         description: Number of articles to return (maximum 500 per Metabase limits)
 *       - in: query
 *         name: sequenceId
 *         schema:
 *           type: string
 *         description: |
 *           Sequence ID for sequential calls to avoid duplicates. Use the lastSequenceId 
 *           from previous response for the next call. Start with "0" for initial request.
 *     responses:
 *       200:
 *         description: Articles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/ArticleSearchResponse'
 *       429:
 *         description: Rate limit exceeded (too frequent calls)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/articles', 
  sanitizeInput,
  articlesRateLimit,
  authMiddleware, 
  validateRequest(articleSearchSchema),
  async (req, res) => {
    try {
      const searchParams = req.validatedData;

      logger.info('📥 Fetching recent articles via Metabase API (basic)', {
        userId: req.user?.id,
        searchParams,
        requestedLimit: searchParams.limit,
        hasSequenceId: !!searchParams.sequenceId
      });

      const result = await metabaseService.getRecentArticles(searchParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error fetching articles via Metabase API', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch articles',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/metabase/articles/revoked:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Get revoked articles (IMPORTANT - Call daily for compliance)
 *     description: |
 *       Get a list of article IDs that have been revoked and should be removed from your system.
 *       This endpoint MUST be called daily to remain compliant with Metabase content licensing.
 *       
 *       **Important Notes:**
 *       - Call this daily to stay current on revocations
 *       - Store article IDs from your content feeds to match against revoked IDs
 *       - Handle duplicates - you may receive multiple revocations for the same article
 *       - Remove matching article IDs from your systems immediately
 *       - Use sequence_id for pagination - start with "0" for initial request
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 1000
 *         description: Number of revoked articles to return (1-10,000 per request)
 *       - in: query
 *         name: sequenceId
 *         schema:
 *           type: string
 *           default: "0"
 *         description: |
 *           Sequence ID for pagination. Use "0" for initial request, then use the 
 *           sequenceId from the response for subsequent requests.
 *           
 *           **Year Jump Sequence IDs:**
 *           - 2020: "00000000"
 *           - 2021: "11111111"  
 *           - 2022: "22222222"
 *           - 2023: "333333333"
 *           - 2024: "444444444"
 *     responses:
 *       200:
 *         description: Revoked articles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/RevokedArticlesResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/articles/revoked', 
  sanitizeInput,
  revokedRateLimit,
  authMiddleware, 
  validateRequest(revokedArticlesSchema),
  async (req, res) => {
    try {
      const revokedParams = req.validatedData;

      logger.info('🔄 Fetching revoked articles via Metabase API (COMPLIANCE)', {
        userId: req.user?.id,
        revokedParams,
        isComplianceCall: true
      });

      const result = await metabaseService.getRevokedArticles(revokedParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error fetching revoked articles via Metabase API', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch revoked articles',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/metabase/rate-limit/check:
 *   get:
 *     tags:
 *       - Metabase Utilities
 *     summary: Check rate limiting status
 *     description: |
 *       Check if you can make a call to Metabase API based on rate limiting rules.
 *       Metabase requires minimum 20 seconds between calls.
 *       
 *       **Note**: This is a local utility function - does not call Metabase API directly.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lastCallTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO timestamp of your last API call
 *     responses:
 *       200:
 *         description: Rate limit status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     canCall:
 *                       type: boolean
 *                       description: Whether you can make a call now
 *                     waitTime:
 *                       type: integer
 *                       description: Milliseconds to wait before next call
 *                     nextCallTime:
 *                       type: string
 *                       format: date-time
 *                       description: ISO timestamp when you can make the next call
 */
router.get('/rate-limit/check', authMiddleware, async (req, res) => {
  try {
    const { lastCallTime } = req.query;
    
    const lastCall = lastCallTime ? new Date(lastCallTime as string) : undefined;
    const rateStatus = metabaseService.checkRateLimit(lastCall);
    
    const nextCallTime = lastCall 
      ? new Date(lastCall.getTime() + 20000).toISOString()
      : new Date().toISOString();

    logger.info('⏱️ Rate limit check performed', {
      userId: req.user?.id,
      lastCallTime,
      canCall: rateStatus.canCall,
      waitTime: rateStatus.waitTime
    });

    res.json({
      status: 'success',
      data: {
        canCall: rateStatus.canCall,
        waitTime: rateStatus.waitTime,
        nextCallTime: nextCallTime
      }
    });
  } catch (error) {
    logger.error('💥 Error checking rate limit', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to check rate limit'
    });
  }
});

/**
 * @openapi
 * /api/v1/metabase/compliance/status:
 *   get:
 *     tags:
 *       - Metabase Utilities
 *     summary: Check compliance workflow status
 *     description: |
 *       Monitor the status of daily compliance workflows including revoked articles processing.
 *       
 *       **Note**: This is a local utility function - tracks internal compliance state.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     lastComplianceCheck:
 *                       type: string
 *                       format: date-time
 *                       description: When compliance was last checked
 *                     revokedArticlesProcessed:
 *                       type: integer
 *                       description: Number of revoked articles processed today
 *                     complianceStatus:
 *                       type: string
 *                       enum: [compliant, overdue, error]
 *                       description: Current compliance status
 */
router.get('/compliance/status', authMiddleware, async (req, res) => {
  try {
    logger.info('📋 Checking compliance workflow status', {
      userId: req.user?.id
    });

    const status = await metabaseService.getComplianceStatus();

    res.json({
      status: 'success',
      data: status
    });
  } catch (error) {
    logger.error('💥 Error checking compliance status', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to check compliance status'
    });
  }
});

/**
 * @openapi
 * /api/v1/metabase/compliance/clicks:
 *   post:
 *     tags:
 *       - Metabase Utilities
 *     summary: Process license compliance clicks
 *     description: |
 *       Process license compliance clicks for articles requiring royalty payments.
 *       This implements the same functionality as the Python example's callMetabaseArticle function.
 *       
 *       **Important**: Some licensed articles require their clickUrl to be called for royalty tracking.
 *       **Note**: This is a local utility function - processes article data you already have.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               articles:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Article ID
 *                     clickUrl:
 *                       type: string
 *                       format: uri
 *                       description: License compliance URL to call
 *                     licenses:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Array of license names
 *                   required:
 *                     - id
 *             required:
 *               - articles
 *     responses:
 *       200:
 *         description: Compliance processing completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total articles processed
 *                     successful:
 *                       type: integer
 *                       description: Successfully clicked articles
 *                     failed:
 *                       type: integer
 *                       description: Failed clicks
 *                     skipped:
 *                       type: integer
 *                       description: Articles skipped (no click URL or licenses)
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           articleId:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [success, failed, skipped]
 *                           message:
 *                             type: string
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/compliance/clicks', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(complianceClicksSchema),
  async (req, res) => {
    try {
      const { articles } = req.validatedData;

      logger.info('🔗 Processing license compliance clicks', {
        userId: req.user?.id,
        articleCount: articles.length
      });

      const result = await metabaseService.processComplianceClicks(articles);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error processing compliance clicks', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to process compliance clicks',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/metabase/cache/stats:
 *   get:
 *     tags:
 *       - Metabase Utilities
 *     summary: Get cache performance metrics
 *     description: |
 *       Retrieve statistics about Metabase data caching performance and efficiency.
 *       
 *       **Note**: This is a local utility function - analyzes internal cache state.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     hitRate:
 *                       type: number
 *                       description: Cache hit rate percentage
 *                     totalRequests:
 *                       type: integer
 *                       description: Total cache requests
 *                     cacheSize:
 *                       type: integer
 *                       description: Current cache size in bytes
 */
router.get('/cache/stats', authMiddleware, async (req, res) => {
  try {
    logger.info('📊 Retrieving cache performance metrics', {
      userId: req.user?.id
    });

    const stats = await metabaseService.getCacheStats();

    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    logger.error('💥 Error retrieving cache stats', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve cache statistics'
    });
  }
});

/**
 * @openapi
 * /api/v1/metabase/processing/batch:
 *   post:
 *     tags:
 *       - Metabase Utilities
 *     summary: Batch process cached articles
 *     description: |
 *       Process multiple cached articles for analysis, tagging, or other operations.
 *       
 *       **Note**: This operates on locally cached data - does not call Metabase API.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               operation:
 *                 type: string
 *                 enum: [analyze, tag, export]
 *                 description: Type of batch operation to perform
 *               articleIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of article IDs to process
 *     responses:
 *       200:
 *         description: Batch processing completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     processed:
 *                       type: integer
 *                       description: Number of articles processed
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.post('/processing/batch', authMiddleware, async (req, res) => {
  try {
    const { operation, articleIds } = req.body;

    logger.info('⚙️ Starting batch processing operation', {
      userId: req.user?.id,
      operation,
      articleCount: articleIds?.length
    });

    const results = await metabaseService.batchProcessArticles(operation, articleIds);

    res.json({
      status: 'success',
      data: results
    });
  } catch (error) {
    logger.error('💥 Error in batch processing', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to process batch operation'
    });
  }
});

/**
 * @openapi
 * /api/v1/metabase/analytics/local:
 *   get:
 *     tags:
 *       - Metabase Utilities
 *     summary: Analyze cached data locally
 *     description: |
 *       Perform analytics on locally cached Metabase data without making API calls.
 *       
 *       **Note**: This analyzes cached data only - does not call Metabase API.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [topics, sources, sentiment, timeline]
 *           default: topics
 *         description: Type of analysis to perform
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Local analytics completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     analysisType:
 *                       type: string
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get('/analytics/local', authMiddleware, async (req, res) => {
  try {
    const { type = 'topics', limit = 20 } = req.query;

    logger.info('🔍 Performing local analytics on cached data', {
      userId: req.user?.id,
      analysisType: type,
      limit: parseInt(limit as string)
    });

    const results = await metabaseService.analyzeLocalData(
      type as string, 
      parseInt(limit as string)
    );

    res.json({
      status: 'success',
      data: results
    });
  } catch (error) {
    logger.error('💥 Error in local analytics', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to perform local analytics'
    });
  }
});

/**
 * @openapi
 * /api/v1/metabase/sync/status:
 *   get:
 *     tags:
 *       - Metabase Utilities
 *     summary: Monitor daily sync status
 *     description: |
 *       Monitor the status of daily synchronization processes with Metabase API.
 *       
 *       **Note**: This tracks internal sync workflow status.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     lastSync:
 *                       type: string
 *                       format: date-time
 *                       description: When sync was last performed
 *                     syncStatus:
 *                       type: string
 *                       enum: [active, idle, error]
 *                       description: Current sync status
 *                     articlesRetrieved:
 *                       type: integer
 *                       description: Articles retrieved in last sync
 *                     nextScheduledSync:
 *                       type: string
 *                       format: date-time
 *                       description: When next sync is scheduled
 */
router.get('/sync/status', authMiddleware, async (req, res) => {
  try {
    logger.info('🔄 Checking daily sync status', {
      userId: req.user?.id
    });

    const status = await metabaseService.getSyncStatus();

    res.json({
      status: 'success',
      data: status
    });
  } catch (error) {
    logger.error('💥 Error checking sync status', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to check sync status'
    });
  }
});

/**
 * @openapi
 * /api/v1/metabase/articles/search:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Search articles (Metabase Search API)
 *     description: |
 *       Search for articles using the Metabase search API across last 100 days of content.
 *       
 *       **Rate Limiting:** Configured by Product Support (check with rateLimits API)
 *       **Note:** This uses the actual /api/v10/searchArticles endpoint with Boolean syntax support.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 10000
 *         description: Search query with Boolean syntax support (required, max 10,000 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 1
 *         description: Number of articles to return (1-200, default 1)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [xml, json, rss, atom]
 *           default: json
 *         description: Response format
 *       - in: query
 *         name: recent
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Search only last 3 days for faster queries
 *       - in: query
 *         name: sequence_id
 *         schema:
 *           type: string
 *         description: Pagination through results (for >200 articles)
 *       - in: query
 *         name: filter_duplicates
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Remove duplicate articles
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order by sequenceId
 *       - in: query
 *         name: relevance_percent
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Filter by relevance percentage (1-100)
 *       - in: query
 *         name: sort_by_relevance
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Sort by relevance instead of sequenceId
 *       - in: query
 *         name: show_relevance_score
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Include relevance scores in response
 *       - in: query
 *         name: show_matching_keywords
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Show which keywords matched
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/ArticleSearchResponse'
 *       400:
 *         description: Invalid search parameters or query too long
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/articles/search', 
  sanitizeInput,
  articlesRateLimit,
  authMiddleware, 
  validateRequest(searchArticlesSchema),
  async (req, res) => {
    try {
      const searchParams = req.validatedData;

      logger.info('🔍 Searching articles via Metabase Search API', {
        userId: req.user?.id,
        query: searchParams.query,
        limit: searchParams.limit,
        format: searchParams.format,
        hasSequenceId: !!searchParams.sequence_id
      });

      const result = await metabaseService.searchArticles(searchParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error searching articles via Metabase Search API', {
        userId: req.user?.id,
        query: req.query.query,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to search articles',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

export default router; 