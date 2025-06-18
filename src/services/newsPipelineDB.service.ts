import { db } from '../db';
import { newsAuthors, newsPipelineRuns, newsAuthorArticles, monitoringEvents, metabaseArticles } from '../db/schema';
import { eq, desc, gte, sql, and, lte } from 'drizzle-orm';
import logger from '../utils/logger';

export class NewsPipelineDBService {
  
  // Pipeline run management
  async startPipelineRun(runType: string): Promise<string> {
    try {
      const [run] = await db.insert(newsPipelineRuns).values({
        runType: runType as any,
        status: 'running',
        startedAt: new Date()
      }).returning({ id: newsPipelineRuns.id });

      return run.id;
    } catch (error) {
      logger.error('Failed to start pipeline run', { runType, error: (error as Error).message });
      throw error;
    }
  }

  async updatePipelineRun(runId: string, updates: {
    status?: 'running' | 'completed' | 'failed' | 'partial';
    articlesProcessed?: number;
    articlesFiltered?: number;
    authorsUpdated?: number;
    authorsCreated?: number;
    recordsCleaned?: number;
    executionTime?: number;
    sequenceIdStart?: string;
    sequenceIdEnd?: string;
    errorMessage?: string;
    errorCode?: string;
  }): Promise<void> {
    try {
      await db.update(newsPipelineRuns)
        .set({
          ...updates,
          completedAt: updates.status === 'completed' || updates.status === 'failed' 
            ? new Date() 
            : undefined
        })
        .where(eq(newsPipelineRuns.id, runId));

    } catch (error) {
      logger.error('Failed to update pipeline run', { runId, error: (error as Error).message });
      throw error;
    }
  }

  async getLastSequenceId(): Promise<string | null> {
    try {
      const [lastRun] = await db
        .select({ sequenceIdEnd: newsPipelineRuns.sequenceIdEnd })
        .from(newsPipelineRuns)
        .where(eq(newsPipelineRuns.status, 'completed'))
        .orderBy(desc(newsPipelineRuns.completedAt))
        .limit(1);

      return lastRun?.sequenceIdEnd || null;
    } catch (error) {
      logger.error('Failed to get last sequence ID', { error: (error as Error).message });
      return null;
    }
  }

  // Author management
  async createOrUpdateAuthor(article: any): Promise<{
    authorId: string;
    created: boolean;
  }> {
    try {
      // Check if author already exists
      const [existingAuthor] = await db
        .select({ id: newsAuthors.id })
        .from(newsAuthors)
        .where(eq(newsAuthors.name, article.author))
        .limit(1);

      if (existingAuthor) {
        // Update existing author
        await db.update(newsAuthors)
          .set({
            lastArticleDate: article.publishedAt ? new Date(article.publishedAt) : new Date(),
            updatedAt: new Date()
          })
          .where(eq(newsAuthors.id, existingAuthor.id));

        return { authorId: existingAuthor.id, created: false };
      }

      // Create new author
      const [newAuthor] = await db.insert(newsAuthors).values({
        name: article.author,
        topics: article.topics || [],
        lastArticleDate: article.publishedAt ? new Date(article.publishedAt) : new Date(),
        metadata: {
          source: article.source,
          firstArticleId: article.id
        }
      }).returning({ id: newsAuthors.id });

      return { authorId: newAuthor.id, created: true };

    } catch (error) {
      logger.error('Failed to create or update author', { 
        author: article.author, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  async createAuthorArticleRelationship(authorId: string, articleId: string): Promise<void> {
    try {
      await db.insert(newsAuthorArticles).values({
        authorId,
        articleId,
        role: 'author',
        extractedFrom: 'byline'
      }).onConflictDoNothing();

    } catch (error) {
      logger.error('Failed to create author-article relationship', { 
        authorId, 
        articleId, 
        error: (error as Error).message 
      });
      // Don't throw - this isn't critical enough to fail the whole pipeline
    }
  }

  // Author retrieval for API endpoints
  async getTopAuthorsByRelevance(
    limit: number = 20, 
    topic?: string
  ): Promise<any[]> {
    try {
      // Removed strict relevance score filter - show all authors regardless of score
      let whereConditions: any[] = [];

      // If topic is provided, add topic filter to where conditions
      if (topic) {
        const topicLower = topic.toLowerCase();
        // Use PostgreSQL array functions to search for topic in topics array
        whereConditions.push(
          sql`EXISTS (
            SELECT 1 
            FROM unnest(${newsAuthors.topics}) AS topic_item 
            WHERE LOWER(topic_item) LIKE ${`%${topicLower}%`}
          )`
        );
      }

      const query = db
        .select({
          id: newsAuthors.id,
          name: newsAuthors.name,
          email: newsAuthors.email,
          organization: newsAuthors.organization,
          relevanceScore: newsAuthors.relevanceScore,
          recentActivityScore: newsAuthors.recentActivityScore,
          articleCount: newsAuthors.articleCount,
          topics: newsAuthors.topics,
          lastArticleDate: newsAuthors.lastArticleDate
        })
        .from(newsAuthors)
        .orderBy(desc(newsAuthors.relevanceScore), desc(newsAuthors.updatedAt))
        .limit(limit);

      // Only apply WHERE conditions if we have any
      const authors = whereConditions.length > 0 
        ? await query.where(sql`${sql.join(whereConditions, sql` AND `)}`)
        : await query;

      logger.info(`Retrieved ${authors.length} authors (limit: ${limit}, topic: ${topic || 'all'})`);
      return authors;
    } catch (error) {
      logger.error('Failed to get top authors', { 
        topic, 
        limit, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  // Get recent processed articles for dashboard
  async getRecentProcessedArticles(limit: number = 50, days?: number): Promise<any[]> {
    try {
      logger.info(`Fetching ${limit} recent articles from metabase_articles table${days ? ` (last ${days} days)` : ''}`);
      
      let whereConditions = and(
        eq(metabaseArticles.isRevoked, false),
        // Only include articles with actual content
        sql`${metabaseArticles.title} IS NOT NULL AND ${metabaseArticles.title} != ''`
      );

      // Add time filter if specified
      if (days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        whereConditions = and(
          whereConditions,
          gte(metabaseArticles.publishedAt, cutoffDate)
        );
      }
      
      const articles = await db
        .select({
          id: metabaseArticles.id,
          title: metabaseArticles.title,
          summary: metabaseArticles.summary,
          author: metabaseArticles.author,
          source: metabaseArticles.source,
          publishedAt: metabaseArticles.publishedAt,
          topics: metabaseArticles.topics,
          url: metabaseArticles.url,
          createdAt: metabaseArticles.createdAt
        })
        .from(metabaseArticles)
        .where(whereConditions)
        .orderBy(desc(metabaseArticles.publishedAt), desc(metabaseArticles.createdAt))
        .limit(limit);

      const processedArticles = articles.map(article => ({
        id: article.id,
        title: article.title,
        author: article.author || 'Unknown Author',
        source: article.source,
        publishedAt: article.publishedAt?.toISOString() || article.createdAt.toISOString(),
        topics: Array.isArray(article.topics) ? article.topics as string[] : [],
        url: article.url,
        summary: article.summary || `Article from ${article.source} covering relevant industry topics.`
      }));

      logger.info(`Retrieved ${processedArticles.length} actual articles from database${days ? ` (filtered to last ${days} days)` : ''}`);
      return processedArticles;
      
    } catch (error) {
      logger.error('Failed to get recent processed articles', { 
        limit, 
        days,
        error: (error as Error).message 
      });
      throw error;
    }
  }

  // Get most frequent authors by recent activity
  async getMostFrequentRecentAuthors(
    limit: number = 20, 
    days: number = 30, 
    topic?: string
  ): Promise<any[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      logger.info(`Getting authors with articles from last ${days} days (since ${cutoffDate.toISOString()})`);

      // Build WHERE conditions
      let whereConditions = and(
        // Authors must have at least one article in the time period
        sql`${metabaseArticles.id} IS NOT NULL`,
        gte(newsAuthors.lastArticleDate, cutoffDate)
      );

      // Add topic filter if provided
      if (topic) {
        const topicLower = topic.toLowerCase();
        whereConditions = and(
          whereConditions,
          sql`EXISTS (
            SELECT 1 
            FROM unnest(${metabaseArticles.topics}) AS topic_item 
            WHERE LOWER(topic_item::text) LIKE ${`%${topicLower}%`}
          )`
        );
      }

      // Query authors who have articles in the specified time period
      const authors = await db
        .select({
          id: newsAuthors.id,
          name: newsAuthors.name,
          email: newsAuthors.email,
          organization: newsAuthors.organization,
          topics: newsAuthors.topics,
          lastArticleDate: newsAuthors.lastArticleDate,
          // Count actual articles in the time period
          recentArticleCount: sql<number>`COUNT(DISTINCT ${metabaseArticles.id})`
        })
        .from(newsAuthors)
        .leftJoin(newsAuthorArticles, eq(newsAuthorArticles.authorId, newsAuthors.id))
        .leftJoin(metabaseArticles, 
          and(
            eq(metabaseArticles.id, newsAuthorArticles.articleId),
            eq(metabaseArticles.isRevoked, false),
            gte(metabaseArticles.publishedAt, cutoffDate)
          )
        )
        .where(whereConditions)
        .groupBy(
          newsAuthors.id,
          newsAuthors.name,
          newsAuthors.email,
          newsAuthors.organization,
          newsAuthors.topics,
          newsAuthors.lastArticleDate
        )
        .orderBy(
          desc(sql`COUNT(DISTINCT ${metabaseArticles.id})`), // Sort by actual article count
          desc(newsAuthors.lastArticleDate) // Then by recency
        )
        .limit(limit);

      // Process the results - use stored topics from newsAuthors table
      const processedAuthors = authors.map(author => ({
        id: author.id,
        name: author.name,
        email: author.email,
        organization: author.organization,
        recentTopics: Array.isArray(author.topics) ? author.topics as string[] : [],
        lastArticleDate: author.lastArticleDate,
        recentArticleCount: author.recentArticleCount || 0
      }));

      logger.info(`Retrieved ${processedAuthors.length} authors with recent activity (limit: ${limit}, days: ${days}, topic: ${topic || 'all'})`);
      return processedAuthors;

    } catch (error) {
      logger.error('Failed to get most frequent recent authors', { 
        limit, 
        days,
        topic, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  // Monitoring events
  async createMonitoringEvent(event: {
    eventType: string;
    severity: string;
    source: string;
    title: string;
    message: string;
    details?: any;
  }): Promise<string> {
    try {
      const [newEvent] = await db.insert(monitoringEvents).values({
        eventType: event.eventType,
        severity: event.severity as any,
        source: event.source,
        title: event.title,
        message: event.message,
        details: event.details || {}
      }).returning({ id: monitoringEvents.id });

      return newEvent.id;
    } catch (error) {
      logger.error('Failed to create monitoring event', { error: (error as Error).message });
      throw error;
    }
  }

  // Storage metrics
  async getStorageMetrics(): Promise<any> {
    try {
      logger.info('Fetching database storage metrics...');

      // Get record counts for each news pipeline table
      const [authorsCount] = await db.select({ count: sql<number>`count(*)` }).from(newsAuthors);
      const [articlesCount] = await db.select({ count: sql<number>`count(*)` }).from(metabaseArticles);
      const [pipelineRunsCount] = await db.select({ count: sql<number>`count(*)` }).from(newsPipelineRuns);
      const [monitoringEventsCount] = await db.select({ count: sql<number>`count(*)` }).from(monitoringEvents);
      const [authorArticlesCount] = await db.select({ count: sql<number>`count(*)` }).from(newsAuthorArticles);

      // Try to get table sizes (PostgreSQL specific)
      let tablesSizeMB = {
        newsAuthors: 0,
        metabaseArticles: 0,
        newsPipelineRuns: 0,
        monitoringEvents: 0
      };

      try {
        const tableSizes = await db.execute(sql`
          SELECT 
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
            pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
          FROM pg_tables 
          WHERE tablename IN ('news_authors', 'metabase_articles', 'news_pipeline_runs', 'monitoring_events')
          AND schemaname = 'public'
        `);

        // Convert sizes to MB
        tableSizes.forEach((row: any) => {
          const sizeMB = row.size_bytes / (1024 * 1024);
          switch (row.tablename) {
            case 'news_authors':
              tablesSizeMB.newsAuthors = sizeMB;
              break;
            case 'metabase_articles':
              tablesSizeMB.metabaseArticles = sizeMB;
              break;
            case 'news_pipeline_runs':
              tablesSizeMB.newsPipelineRuns = sizeMB;
              break;
            case 'monitoring_events':
              tablesSizeMB.monitoringEvents = sizeMB;
              break;
          }
        });
      } catch (sizeError) {
        logger.warn('Could not fetch table sizes, using estimates based on record counts');
        // Estimate sizes based on record counts (rough approximation)
        tablesSizeMB.newsAuthors = (authorsCount?.count || 0) * 0.001; // ~1KB per author record
        tablesSizeMB.metabaseArticles = (articlesCount?.count || 0) * 0.005; // ~5KB per article record
        tablesSizeMB.newsPipelineRuns = (pipelineRunsCount?.count || 0) * 0.002; // ~2KB per run record
        tablesSizeMB.monitoringEvents = (monitoringEventsCount?.count || 0) * 0.001; // ~1KB per event
      }

      const totalSizeMB = Object.values(tablesSizeMB).reduce((sum, size) => sum + size, 0);

      const metrics = {
        totalSizeMB,
        tablesSizeMB,
        totalRecords: {
          newsAuthors: Number(authorsCount?.count || 0),
          metabaseArticles: Number(articlesCount?.count || 0),
          newsPipelineRuns: Number(pipelineRunsCount?.count || 0),
          monitoringEvents: Number(monitoringEventsCount?.count || 0),
          newsAuthorArticles: Number(authorArticlesCount?.count || 0)
        },
        lastUpdated: new Date().toISOString()
      };

      logger.info('Storage metrics retrieved successfully', metrics);
      return metrics;

    } catch (error) {
      logger.error('Failed to get storage metrics', { error: (error as Error).message });
      throw error;
    }
  }
} 