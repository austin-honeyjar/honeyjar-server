import express from 'express';
import { Request, Response } from 'express';
import logger from '../utils/logger';
import { backgroundWorker } from '../workers/backgroundWorker';
import { NewsPipelineDBService } from '../services/newsPipelineDB.service';
import { DatabaseCleanupService } from '../services/databaseCleanup.service';
import { RocketReachService, EnrichedContact } from '../services/rocketreach.service';
import { db } from '../db';
import { newsPipelineRuns } from '../db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { metabaseArticles } from '../db/schema';

const router = express.Router();
const newsPipelineDBService = new NewsPipelineDBService();
const databaseCleanupService = new DatabaseCleanupService();
const rocketReachService = new RocketReachService();

/**
 * @swagger
 * /api/v1/news/authors/top:
 *   get:
 *     summary: Get top relevant authors for workflow engine
 *     tags: [News Pipeline]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of authors to return
 *       - in: query
 *         name: topic
 *         schema:
 *           type: string
 *         description: Filter authors by topic (case-insensitive partial match)
 *         example: "artificial intelligence"
 *       - in: query
 *         name: minScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 200
 *           default: 1.0
 *         description: Minimum relevance score
 *     responses:
 *       200:
 *         description: List of top authors
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
 *                     authors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           organization:
 *                             type: string
 *                           relevanceScore:
 *                             type: number
 *                           articleCount:
 *                             type: integer
 *                           topics:
 *                             type: array
 *                             items:
 *                               type: string
 *                           lastArticleDate:
 *                             type: string
 *                             format: date-time
 */
router.get('/authors/top', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const topic = req.query.topic as string;
    
    const authors = await newsPipelineDBService.getTopAuthorsByRelevance(limit, topic);

    res.json({
      status: 'success',
      data: {
        authors: authors.map(author => ({
          id: author.id,
          name: author.name,
          email: author.email,
          organization: author.organization,
          relevanceScore: author.relevanceScore,
          recentActivityScore: author.recentActivityScore,
          articleCount: author.articleCount,
          topics: author.topics,
          lastArticleDate: author.lastArticleDate
        })),
        total: authors.length,
        query: { limit, topic: topic || null },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching top authors', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch authors',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/authors/recent:
 *   get:
 *     summary: Get most frequent authors by recent activity
 *     tags: [News Pipeline]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of authors to return
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to look back for recent activity
 *       - in: query
 *         name: topic
 *         schema:
 *           type: string
 *         description: Filter authors by topic (case-insensitive partial match)
 *     responses:
 *       200:
 *         description: List of most frequent recent authors
 */
router.get('/authors/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const topic = req.query.topic as string;
    
    const authors = await newsPipelineDBService.getMostFrequentRecentAuthors(limit, days, topic);

    res.json({
      status: 'success',
      data: {
        authors: authors.map(author => ({
          id: author.id,
          name: author.name,
          email: author.email,
          organization: author.organization,
          recentArticleCount: author.recentArticleCount,
          topics: author.recentTopics,
          lastArticleDate: author.lastArticleDate,
          // Keep legacy fields for compatibility
          relevanceScore: author.recentArticleCount * 2, // Simple scoring based on frequency
          articleCount: author.recentArticleCount
        })),
        total: authors.length,
        query: { limit, days, topic: topic || null },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching recent authors', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch recent authors',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/pipeline/test:
 *   post:
 *     summary: Manually trigger news pipeline for testing
 *     tags: [News Pipeline]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1000
 *                 default: 200
 *                 description: Maximum number of articles to process
 *     responses:
 *       200:
 *         description: Pipeline executed successfully
 *       500:
 *         description: Pipeline execution failed
 */
router.post('/pipeline/test', async (req: Request, res: Response) => {
  try {
    const { limit = 200 } = req.body;
    const articleLimit = Math.min(Math.max(parseInt(limit), 1), 1000); // Clamp between 1 and 1000
    
    logger.info(`Manual news pipeline test triggered via API with limit: ${articleLimit}`);
    await backgroundWorker.runNewsPipeline(articleLimit);
    
    res.json({
      status: 'success',
      message: `News pipeline executed successfully with limit: ${articleLimit}`,
      timestamp: new Date().toISOString(),
      articleLimit
    });

  } catch (error) {
    logger.error('Manual news pipeline test failed', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'News pipeline execution failed',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/pipeline/status:
 *   get:
 *     summary: Get news pipeline health and status
 *     tags: [News Pipeline]
 *     responses:
 *       200:
 *         description: Pipeline status information
 */
router.get('/pipeline/status', async (req: Request, res: Response) => {
  try {
    // This is a basic status check - can be expanded later
    res.json({
      status: 'success',
      data: {
        pipelineHealth: 'healthy',
        message: 'News pipeline is operational',
        timestamp: new Date().toISOString(),
        features: {
          backgroundWorker: 'active',
          monitoring: 'enabled',
          authorScoring: 'pending implementation',
          databaseCleanup: 'pending implementation'
        }
      }
    });

  } catch (error) {
    logger.error('Error getting pipeline status', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get pipeline status',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/compliance/status:
 *   get:
 *     summary: Get 24-hour compliance status
 *     tags: [News Pipeline]
 *     responses:
 *       200:
 *         description: Compliance status information
 */
router.get('/compliance/status', async (req: Request, res: Response) => {
  try {
    const complianceStatus = await databaseCleanupService.getComplianceStatus();
    
    // Determine compliance health
    let status = 'compliant';
    let message = 'All articles within 24-hour compliance window';
    
    if (complianceStatus.articlesOverdue > 0) {
      status = 'violation';
      message = `${complianceStatus.articlesOverdue} articles are overdue for deletion`;
    } else if (complianceStatus.articlesNearingExpiry > 0) {
      status = 'warning';
      message = `${complianceStatus.articlesNearingExpiry} articles approaching 24-hour limit`;
    }

    res.json({
      status: 'success',
      data: {
        complianceStatus: status,
        message,
        articlesNearingExpiry: complianceStatus.articlesNearingExpiry,
        articlesOverdue: complianceStatus.articlesOverdue,
        nextCleanupScheduled: complianceStatus.nextCleanupNeeded,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error getting compliance status', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get compliance status',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/compliance/cleanup:
 *   post:
 *     summary: Manually trigger compliance cleanup
 *     tags: [News Pipeline]
 *     responses:
 *       200:
 *         description: Cleanup executed successfully
 */
router.post('/compliance/cleanup', async (req: Request, res: Response) => {
  try {
    logger.info('Manual compliance cleanup triggered via API');
    const cleanupResult = await databaseCleanupService.runCleanup();
    
    res.json({
      status: 'success',
      message: 'Compliance cleanup executed successfully',
      data: {
        articlesRemoved: cleanupResult.oldArticlesRemoved,
        logsRemoved: cleanupResult.oldLogsRemoved,
        eventsRemoved: cleanupResult.oldComplianceRecordsArchived,
        relationshipsCleared: cleanupResult.authorRelationshipsCleared
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Manual compliance cleanup failed', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Compliance cleanup failed',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/media-list/generate:
 *   post:
 *     summary: Generate media contact list for a specific topic
 *     tags: [News Pipeline]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *             properties:
 *               topic:
 *                 type: string
 *                 description: The topic to search for relevant media contacts
 *                 example: "artificial intelligence"
 *               limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 10
 *                 description: Maximum number of contacts to return
 *               enrichContacts:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to enrich contacts with RocketReach API
 *     responses:
 *       200:
 *         description: Media contacts list generated successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Failed to generate media list
 */
router.post('/media-list/generate', async (req: Request, res: Response) => {
  try {
    const { topic, limit = 10, enrichContacts = true } = req.body;

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Topic is required and must be a string'
      });
    }

    const maxLimit = Math.min(limit, 50);

    logger.info('Generating media list', { topic, limit: maxLimit, enrichContacts });

    // Step 1: Get relevant authors from database
    const authors = await newsPipelineDBService.getTopAuthorsByRelevance(maxLimit, topic);

    if (authors.length === 0) {
      return res.json({
        status: 'success',
        data: {
          topic,
          mediaContactsList: [],
          totalContacts: 0,
          enrichmentSuccess: '0%',
          message: 'No relevant authors found for this topic'
        }
      });
    }

    // Step 2: Enrich contacts if requested
    let enrichedContacts: EnrichedContact[] = [];
    let enrichmentSuccess = '0%';
    let shouldEnrichContacts = enrichContacts;

    if (shouldEnrichContacts) {
      try {
        enrichedContacts = await rocketReachService.enrichContacts(authors);
        const successfulEnrichments = enrichedContacts.filter(c => c.source === 'rocketreach').length;
        enrichmentSuccess = authors.length > 0 
          ? `${Math.round((successfulEnrichments / authors.length) * 100)}%`
          : '0%';
      } catch (error) {
        logger.error('Contact enrichment failed, using database info only', { error: (error as Error).message });
        shouldEnrichContacts = false;
      }
    }

    // Step 3: Format final media contacts list
    const mediaContactsList = shouldEnrichContacts ? enrichedContacts.map((contact, index) => ({
      rank: index + 1,
      name: contact.name,
      title: contact.title,
      organization: contact.organization,
      email: contact.email,
      phone: contact.phone,
      linkedin: contact.linkedin,
      twitter: contact.twitter,
      confidence: contact.confidence,
      source: contact.source,
      enrichmentScore: contact.enrichmentScore,
      // Include original author data
      relevanceScore: authors.find(a => a.id === contact.authorId)?.relevanceScore || 0,
      articleCount: authors.find(a => a.id === contact.authorId)?.articleCount || 0,
      topics: authors.find(a => a.id === contact.authorId)?.topics || []
    })) : authors.map((author, index) => ({
      rank: index + 1,
      name: author.name,
      title: null,
      organization: author.organization,
      email: author.email,
      phone: null,
      linkedin: null,
      twitter: null,
      confidence: 'medium' as const,
      source: 'database' as const,
      enrichmentScore: 1.0,
      relevanceScore: author.relevanceScore,
      articleCount: author.articleCount,
      topics: author.topics
    }));

    // Sort by relevance score (descending)
    mediaContactsList.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Update ranks after sorting
    mediaContactsList.forEach((contact, index) => {
      contact.rank = index + 1;
    });

    res.json({
      status: 'success',
      data: {
        topic,
        mediaContactsList,
        totalContacts: mediaContactsList.length,
        enrichmentSuccess,
        listGeneratedAt: new Date().toISOString(),
        rocketReachUsed: shouldEnrichContacts,
        query: { topic, limit: maxLimit, enrichContacts }
      }
    });

  } catch (error) {
    logger.error('Error generating media list', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate media list',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/articles/recent:
 *   get:
 *     summary: Get recent processed articles
 *     tags: [News Pipeline]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of articles to return
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: null
 *         description: Filter articles from the last N days (optional)
 *     responses:
 *       200:
 *         description: List of recent processed articles
 */
router.get('/articles/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const days = req.query.days ? Math.min(parseInt(req.query.days as string), 365) : undefined;
    
    const articles = await newsPipelineDBService.getRecentProcessedArticles(limit, days);

    res.json({
      status: 'success',
      data: {
        articles: articles.map(article => ({
          id: article.id,
          title: article.title,
          author: article.author,
          source: article.source,
          publishedAt: article.publishedAt,
          topics: article.topics,
          url: article.url,
          summary: article.summary
        })),
        total: articles.length,
        query: { limit, days: days || null },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching recent articles', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch recent articles',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/storage/metrics:
 *   get:
 *     summary: Get database storage metrics
 *     tags: [News Pipeline]
 *     responses:
 *       200:
 *         description: Storage metrics and database statistics
 */
router.get('/storage/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await newsPipelineDBService.getStorageMetrics();

    res.json({
      status: 'success',
      data: metrics
    });

  } catch (error) {
    logger.error('Error getting storage metrics', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get storage metrics',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/debug/stats:
 *   get:
 *     summary: Get database and pipeline statistics for debugging
 *     tags: [News Pipeline]
 *     responses:
 *       200:
 *         description: Debug statistics
 */
router.get('/debug/stats', async (req: Request, res: Response) => {
  try {
    // Get total author count and sample authors
    const totalAuthors = await newsPipelineDBService.getTopAuthorsByRelevance(1000);
    const recentAuthors = await newsPipelineDBService.getMostFrequentRecentAuthors(20, 30);
    
    // Get recent pipeline runs
    const recentRuns = await db
      .select({
        id: newsPipelineRuns.id,
        runType: newsPipelineRuns.runType,
        status: newsPipelineRuns.status,
        articlesProcessed: newsPipelineRuns.articlesProcessed,
        authorsCreated: newsPipelineRuns.authorsCreated,
        authorsUpdated: newsPipelineRuns.authorsUpdated,
        startedAt: newsPipelineRuns.startedAt,
        completedAt: newsPipelineRuns.completedAt,
        sequenceIdEnd: newsPipelineRuns.sequenceIdEnd
      })
      .from(newsPipelineRuns)
      .orderBy(desc(newsPipelineRuns.startedAt))
      .limit(10);

    // Get sequence ID info
    const lastSequenceId = await newsPipelineDBService.getLastSequenceId();

    // Sample some random authors
    const sampleAuthors = totalAuthors.slice(0, 10).map(author => ({
      name: author.name,
      topics: author.topics,
      lastArticleDate: author.lastArticleDate,
      articleCount: author.articleCount,
      relevanceScore: author.relevanceScore
    }));

    res.json({
      status: 'success',
      data: {
        database: {
          totalAuthors: totalAuthors.length,
          recentActiveAuthors: recentAuthors.length,
          sampleAuthors
        },
        pipeline: {
          lastSequenceId,
          recentRuns: recentRuns.map(run => ({
            ...run,
            duration: run.completedAt && run.startedAt 
              ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
              : null
          }))
        },
        issues: {
          noRecentRuns: recentRuns.length === 0,
          noAuthors: totalAuthors.length === 0,
          limitedRecentActivity: recentAuthors.length < 5,
          lastRunFailed: recentRuns[0]?.status === 'failed',
          noSequenceProgress: !lastSequenceId || lastSequenceId === '0'
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error getting debug stats', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get debug stats',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/debug/counts:
 *   get:
 *     summary: Get actual database counts for debugging
 *     tags: [News Pipeline]
 */
router.get('/debug/counts', async (req: Request, res: Response) => {
  try {
    // Get actual database counts
    const [totalArticles] = await db.select({ count: sql<number>`count(*)` }).from(metabaseArticles);
    const [activeArticles] = await db.select({ count: sql<number>`count(*)` }).from(metabaseArticles).where(eq(metabaseArticles.isRevoked, false));
    const [revokedArticles] = await db.select({ count: sql<number>`count(*)` }).from(metabaseArticles).where(eq(metabaseArticles.isRevoked, true));
    
    // Get recent article counts by date
    const recentByDate = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM metabase_articles 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
    `);

    // Get recent pipeline runs
    const recentRuns = await db
      .select({
        id: newsPipelineRuns.id,
        runType: newsPipelineRuns.runType,
        status: newsPipelineRuns.status,
        articlesProcessed: newsPipelineRuns.articlesProcessed,
        authorsCreated: newsPipelineRuns.authorsCreated,
        authorsUpdated: newsPipelineRuns.authorsUpdated,
        startedAt: newsPipelineRuns.startedAt,
        completedAt: newsPipelineRuns.completedAt
      })
      .from(newsPipelineRuns)
      .orderBy(desc(newsPipelineRuns.startedAt))
      .limit(10);

    // Check for potential duplicates by looking at articles with same title/url
    const duplicateCheck = await db.execute(sql`
      SELECT 
        COUNT(*) as total_duplicates,
        COUNT(DISTINCT title) as unique_titles,
        COUNT(DISTINCT url) as unique_urls
      FROM metabase_articles
    `);

    res.json({
      status: 'success',
      data: {
        articleCounts: {
          total: totalArticles?.count || 0,
          active: activeArticles?.count || 0,
          revoked: revokedArticles?.count || 0
        },
        recentActivity: recentByDate,
        recentPipelineRuns: recentRuns,
        duplicateAnalysis: duplicateCheck[0],
        warning: totalArticles?.count > 10000 ? 'Unusually high article count detected' : null,
        recommendation: totalArticles?.count > 100000 ? 'Consider running cleanup to remove old/duplicate articles' : null
      }
    });

  } catch (error) {
    logger.error('Error getting debug counts', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get debug counts',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/realtime/status:
 *   get:
 *     summary: Get real-time pipeline status and metrics
 *     tags: [News Pipeline]
 */
router.get('/realtime/status', async (req: Request, res: Response) => {
  try {
    // Get currently running pipeline
    const runningPipeline = await db
      .select({
        id: newsPipelineRuns.id,
        runType: newsPipelineRuns.runType,
        status: newsPipelineRuns.status,
        articlesProcessed: newsPipelineRuns.articlesProcessed,
        startedAt: newsPipelineRuns.startedAt,
        executionTime: newsPipelineRuns.executionTime
      })
      .from(newsPipelineRuns)
      .where(eq(newsPipelineRuns.status, 'running'))
      .orderBy(desc(newsPipelineRuns.startedAt))
      .limit(1);

    // Get real-time article counts
    const [totalArticles] = await db.select({ count: sql<number>`count(*)` }).from(metabaseArticles);
    const [activeArticles] = await db.select({ count: sql<number>`count(*)` }).from(metabaseArticles).where(eq(metabaseArticles.isRevoked, false));
    
    // Get today's processed articles
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayProcessed = await db.execute(sql`
      SELECT COALESCE(SUM(articles_processed), 0) as today_total
      FROM news_pipeline_runs 
      WHERE started_at >= ${today}
      AND status = 'completed'
    `);

    // Get last 5 pipeline runs for activity feed
    const recentRuns = await db
      .select({
        id: newsPipelineRuns.id,
        runType: newsPipelineRuns.runType,
        status: newsPipelineRuns.status,
        articlesProcessed: newsPipelineRuns.articlesProcessed,
        startedAt: newsPipelineRuns.startedAt,
        completedAt: newsPipelineRuns.completedAt,
        executionTime: newsPipelineRuns.executionTime
      })
      .from(newsPipelineRuns)
      .orderBy(desc(newsPipelineRuns.startedAt))
      .limit(5);

    // Get storage metrics
    const storageMetrics = await newsPipelineDBService.getStorageMetrics();

    // Calculate time to next pull
    const syncFrequencyMinutes = parseInt(process.env.NEWS_SYNC_FREQUENCY_MINUTES || '15');
    const lastCompletedRun = await db
      .select({
        startedAt: newsPipelineRuns.startedAt,
        completedAt: newsPipelineRuns.completedAt
      })
      .from(newsPipelineRuns)
      .orderBy(desc(newsPipelineRuns.startedAt))
      .limit(1);

    let nextPullIn = null;
    let nextPullTime = null;
    
    if (lastCompletedRun.length > 0) {
      const lastRunTime = new Date(lastCompletedRun[0].startedAt);
      const nextRunTime = new Date(lastRunTime.getTime() + (syncFrequencyMinutes * 60 * 1000));
      const now = new Date();
      
      if (nextRunTime > now) {
        nextPullIn = Math.ceil((nextRunTime.getTime() - now.getTime()) / 1000); // seconds until next pull
        nextPullTime = nextRunTime.toISOString();
      } else {
        nextPullIn = 0; // Overdue or should run now
        nextPullTime = now.toISOString();
      }
    } else {
      // No previous runs, next pull could be anytime
      nextPullIn = syncFrequencyMinutes * 60; // Assume next pull in full frequency time
      nextPullTime = new Date(Date.now() + (syncFrequencyMinutes * 60 * 1000)).toISOString();
    }

    // Calculate pipeline health
    const failedRunsLast24h = await db.execute(sql`
      SELECT COUNT(*) as failed_count
      FROM news_pipeline_runs 
      WHERE started_at >= NOW() - INTERVAL '24 hours'
      AND status = 'failed'
    `);

    const totalRunsLast24h = await db.execute(sql`
      SELECT COUNT(*) as total_count
      FROM news_pipeline_runs 
      WHERE started_at >= NOW() - INTERVAL '24 hours'
    `);

    const failureRate = (totalRunsLast24h[0] as any)?.total_count > 0 
      ? ((failedRunsLast24h[0] as any)?.failed_count / (totalRunsLast24h[0] as any)?.total_count) * 100 
      : 0;

    // Determine overall health
    let pipelineHealth = 'healthy';
    if (failureRate > 20) pipelineHealth = 'degraded';
    if (failureRate > 50) pipelineHealth = 'unhealthy';
    if (runningPipeline.length > 0) {
      const runtime = Date.now() - new Date(runningPipeline[0].startedAt).getTime();
      if (runtime > 10 * 60 * 1000) pipelineHealth = 'stuck'; // 10 minutes
    }

    res.json({
      status: 'success',
      data: {
        pipeline: {
          isRunning: runningPipeline.length > 0,
          currentRun: runningPipeline[0] || null,
          health: pipelineHealth,
          failureRate: Math.round(failureRate * 100) / 100,
          lastRuns: recentRuns,
          nextPullIn,
          nextPullTime,
          syncFrequencyMinutes
        },
        metrics: {
          articles: {
            total: totalArticles?.count || 0,
            active: activeArticles?.count || 0,
            revoked: (totalArticles?.count || 0) - (activeArticles?.count || 0),
            processedToday: (todayProcessed[0] as any)?.today_total || 0
          },
          storage: {
            totalSizeMB: storageMetrics.totalSizeMB,
            totalRecords: Object.entries(storageMetrics.totalRecords).reduce((sum, [_, count]) => sum + Number(count), 0),
            breakdown: storageMetrics.totalRecords
          }
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error getting real-time status', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get real-time status',
      error: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/pipeline/fix-stuck:
 *   post:
 *     summary: Fix stuck pipeline runs
 *     tags: [News Pipeline]
 *     responses:
 *       200:
 *         description: Stuck pipelines fixed
 */
router.post('/pipeline/fix-stuck', async (req: Request, res: Response) => {
  try {
    // Find pipeline runs stuck in 'running' status for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const stuckRuns = await db
      .select({
        id: newsPipelineRuns.id,
        runType: newsPipelineRuns.runType,
        startedAt: newsPipelineRuns.startedAt
      })
      .from(newsPipelineRuns)
      .where(
        sql`status = 'running' AND started_at < ${tenMinutesAgo}`
      );

    if (stuckRuns.length === 0) {
      return res.json({
        status: 'success',
        message: 'No stuck pipeline runs found',
        fixed: 0
      });
    }

    // Update stuck runs to 'failed' status
    await db
      .update(newsPipelineRuns)
      .set({
        status: 'failed',
        errorMessage: 'Pipeline run was stuck and auto-recovered',
        completedAt: new Date(),
        executionTime: sql`EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000`
      })
      .where(
        sql`status = 'running' AND started_at < ${tenMinutesAgo}`
      );

    logger.info('Fixed stuck pipeline runs', { 
      count: stuckRuns.length,
      runIds: stuckRuns.map(r => r.id)
    });

    res.json({
      status: 'success',
      message: `Fixed ${stuckRuns.length} stuck pipeline run(s)`,
      fixed: stuckRuns.length,
      stuckRuns: stuckRuns.map(run => ({
        id: run.id,
        type: run.runType,
        stuckSince: run.startedAt,
        stuckDuration: Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000)
      }))
    });

  } catch (error) {
    logger.error('Error fixing stuck pipeline runs', { error: (error as Error).message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fix stuck pipeline runs',
      error: (error as Error).message
    });
  }
});

export default router; 