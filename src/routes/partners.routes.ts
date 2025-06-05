import { Router } from 'express';
import { PartnersService } from '../services/partners.service';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
const partnersService = new PartnersService();

/**
 * @openapi
 * /api/v1/partners/articles:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Get recent articles (basic)
 *     description: Fetch recent articles from Metabase API without search filters - basic endpoint to test connectivity
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 10
 *         description: Number of articles to return
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/articles', authMiddleware, async (req, res) => {
  try {
    const {
      limit = 10
    } = req.query;

    const searchParams = {
      limit: parseInt(limit as string, 10)
    };

    logger.info('📥 Fetching recent articles via Metabase API (basic)', {
      userId: req.user?.id,
      searchParams,
      requestedLimit: searchParams.limit
    });

    const result = await partnersService.searchArticles(searchParams);

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
});

/**
 * @openapi
 * /api/v1/partners/articles/search:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Search articles (advanced)
 *     description: |
 *       Advanced search endpoint for complex article queries with filtering and search capabilities.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search query for articles
 *         example: "artificial intelligence"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 100
 *         description: Number of articles to return
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [relevance, date, popularity]
 *           default: relevance
 *         description: Sort order for results
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter articles from this date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter articles until this date (YYYY-MM-DD)
 *       - in: query
 *         name: sources
 *         schema:
 *           type: string
 *         description: Comma-separated list of news sources
 *     responses:
 *       200:
 *         description: Articles found successfully
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
router.get('/articles/search', authMiddleware, async (req, res) => {
  try {
    const {
      query,
      limit = 100,
      sortBy = 'relevance',
      startDate,
      endDate,
      sources
    } = req.query;

    const searchParams = {
      query: query as string,
      limit: parseInt(limit as string, 10),
      sortBy: sortBy as 'relevance' | 'date' | 'popularity',
      startDate: startDate as string,
      endDate: endDate as string,
      sources: sources ? (sources as string).split(',') : undefined
    };

    logger.info('🔍 Searching articles via Metabase API (advanced)', {
      userId: req.user?.id,
      searchParams,
      hasQuery: !!searchParams.query,
      hasDateRange: !!(searchParams.startDate || searchParams.endDate),
      hasSources: !!searchParams.sources?.length
    });

    const result = await partnersService.searchArticles(searchParams);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error('💥 Error searching articles via Metabase API', {
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
});

/**
 * @openapi
 * /api/v1/partners/articles/revoked:
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
router.get('/articles/revoked', authMiddleware, async (req, res) => {
  try {
    const {
      limit = 1000,
      sequenceId = '0'
    } = req.query;

    const revokedParams = {
      limit: parseInt(limit as string, 10),
      sequenceId: sequenceId as string
    };

    logger.info('🔄 Fetching revoked articles via Metabase API (COMPLIANCE)', {
      userId: req.user?.id,
      revokedParams,
      isComplianceCall: true
    });

    const result = await partnersService.getRevokedArticles(revokedParams);

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
});

/**
 * @openapi
 * /api/v1/partners/articles/{articleId}:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Get article details by ID
 *     description: Retrieve detailed information about a specific article (simulated by searching through recent articles)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: articleId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the article to retrieve
 *     responses:
 *       200:
 *         description: Article details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Article'
 *       404:
 *         description: Article not found
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
router.get('/articles/:articleId', authMiddleware, async (req, res) => {
  try {
    const { articleId } = req.params;

    logger.info('🔍 Fetching article details via Metabase API', {
      userId: req.user?.id,
      articleId,
      requestType: 'single_article'
    });

    const article = await partnersService.getArticleById(articleId);

    res.json({
      status: 'success',
      data: article
    });
  } catch (error) {
    logger.error('💥 Error fetching article details via Metabase API', {
      userId: req.user?.id,
      articleId: req.params.articleId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Check if it's a 404 error
    if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
      return res.status(404).json({
        status: 'error',
        message: 'Article not found'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch article details',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * @openapi
 * /api/v1/partners/topics/trending:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Get trending topics
 *     description: Retrieve trending topics extracted from recent articles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of topics to return
 *     responses:
 *       200:
 *         description: Trending topics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["artificial intelligence", "climate change", "cryptocurrency"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/topics/trending', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '10', 10);

    logger.info('📊 Fetching trending topics via Metabase API', {
      userId: req.user?.id,
      limit,
      requestType: 'trending_topics'
    });

    const topics = await partnersService.getTrendingTopics(limit);

    res.json({
      status: 'success',
      data: topics
    });
  } catch (error) {
    logger.error('💥 Error fetching trending topics via Metabase API', {
      userId: req.user?.id,
      limit: req.query.limit,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch trending topics',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * @openapi
 * /api/v1/partners/sources:
 *   get:
 *     tags:
 *       - Metabase API
 *     summary: Get available news sources
 *     description: Retrieve a list of news sources extracted from recent articles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: News sources retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Reuters", "Associated Press", "BBC News"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/sources', authMiddleware, async (req, res) => {
  try {
    logger.info('📰 Fetching news sources via Metabase API', {
      userId: req.user?.id,
      requestType: 'news_sources'
    });

    const sources = await partnersService.getNewsSources();

    res.json({
      status: 'success',
      data: sources
    });
  } catch (error) {
    logger.error('💥 Error fetching news sources via Metabase API', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch news sources',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

export default router; 