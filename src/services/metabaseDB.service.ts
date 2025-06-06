import { db } from '../db';
import { metabaseArticles, metabaseRevokedArticles, metabaseComplianceStatus, metabaseApiCalls } from '../db/schema';
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm';
import logger from '../utils/logger';
import { Article } from './metabase.service';

export class MetabaseDBService {
  
  /**
   * Store article data from Metabase API
   */
  async storeArticle(articleData: Article): Promise<void> {
    try {
      const article = {
        id: articleData.id,
        title: articleData.title,
        summary: articleData.summary,
        content: articleData.content,
        url: articleData.url,
        source: articleData.source,
        publishedAt: articleData.publishedAt ? new Date(articleData.publishedAt) : null,
        estimatedPublishedDate: articleData.estimatedPublishedDate ? new Date(articleData.estimatedPublishedDate) : null,
        harvestDate: articleData.harvestDate ? new Date(articleData.harvestDate) : null,
        author: articleData.author,
        topics: articleData.topics || [],
        licenses: articleData.licenses || [],
        clickUrl: articleData.metadata?.clickUrl,
        sequenceId: articleData.metadata?.sequenceId,
        metadata: {
          extract: articleData.extract,
          contentWithMarkup: articleData.contentWithMarkup,
          commentsUrl: articleData.commentsUrl,
          outboundUrls: articleData.outboundUrls || [],
          updateDate: articleData.updateDate,
          embargoDate: articleData.embargoDate,
          licenseEndDate: articleData.licenseEndDate,
          authorDetails: articleData.authorDetails,
          tags: articleData.tags || [],
          wordCount: articleData.wordCount,
          dataFormat: articleData.dataFormat,
          copyright: articleData.copyright,
          loginStatus: articleData.loginStatus,
          duplicateGroupId: articleData.duplicateGroupId,
          contentGroupIds: articleData.contentGroupIds || [],
          adultLanguage: articleData.adultLanguage,
          media: articleData.media,
          companies: articleData.companies || [],
          indexTerms: articleData.indexTerms || [],
          sentiment: articleData.sentiment,
          semantics: articleData.semantics,
          locations: articleData.locations || [],
          language: articleData.metadata?.language,
          languageCode: articleData.metadata?.languageCode
        },
        isRevoked: false,
        updatedAt: new Date()
      };

      await db.insert(metabaseArticles)
        .values(article)
        .onConflictDoUpdate({
          target: metabaseArticles.id,
          set: {
            ...article,
            updatedAt: new Date()
          }
        });

      logger.info('✅ Article data stored successfully', {
        articleId: article.id,
        title: article.title?.substring(0, 50) + '...',
        source: article.source
      });

    } catch (error) {
      logger.error('💥 Failed to store article data', {
        articleId: articleData.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Store multiple articles in batch
   */
  async storeArticles(articles: Article[]): Promise<void> {
    try {
      logger.info('📦 Storing articles in batch', { count: articles.length });

      for (const article of articles) {
        await this.storeArticle(article);
      }

      logger.info('✅ Batch article storage completed', { 
        stored: articles.length 
      });

    } catch (error) {
      logger.error('💥 Failed to store articles batch', {
        count: articles.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Store revoked article data and mark existing articles as revoked
   */
  async storeRevokedArticles(revokedArticleIds: string[]): Promise<void> {
    try {
      logger.info('📋 Storing revoked articles', { count: revokedArticleIds.length });

      // Store revoked article records
      for (const articleId of revokedArticleIds) {
        await db.insert(metabaseRevokedArticles)
          .values({
            articleId,
            revokedDate: new Date(),
            processed: false
          })
          .onConflictDoNothing();
      }

      // Mark existing articles as revoked
      await this.markArticlesAsRevoked(revokedArticleIds);

      logger.info('✅ Revoked articles stored successfully', {
        count: revokedArticleIds.length
      });

    } catch (error) {
      logger.error('💥 Failed to store revoked articles', {
        count: revokedArticleIds.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Mark articles as revoked in the main articles table
   */
  async markArticlesAsRevoked(articleIds: string[]): Promise<void> {
    try {
      for (const articleId of articleIds) {
        await db.update(metabaseArticles)
          .set({ 
            isRevoked: true,
            updatedAt: new Date()
          })
          .where(eq(metabaseArticles.id, articleId));
      }

      logger.info('✅ Articles marked as revoked', {
        count: articleIds.length
      });

    } catch (error) {
      logger.error('💥 Failed to mark articles as revoked', {
        count: articleIds.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Log API call for sync history and compliance tracking
   */
  async logApiCall(callData: {
    callType: string;
    endpoint: string;
    parameters: any;
    responseStatus: number;
    responseTime: number;
    articlesReturned: number;
    sequenceId?: string;
    errorMessage?: string;
    errorCode?: string;
    cacheHit?: boolean;
    metadata?: any;
  }): Promise<void> {
    try {
      await db.insert(metabaseApiCalls).values({
        callType: callData.callType as any,
        endpoint: callData.endpoint,
        parameters: callData.parameters,
        responseStatus: callData.responseStatus,
        responseTime: callData.responseTime,
        articlesReturned: callData.articlesReturned,
        errorMessage: callData.errorMessage,
        errorCode: callData.errorCode,
        sequenceId: callData.sequenceId,
        rateLimitInfo: callData.metadata?.rateLimitInfo || {},
        cacheHit: callData.cacheHit || false,
        metadata: callData.metadata || {}
      });

      logger.debug('📊 Metabase API call logged to database', {
        callType: callData.callType,
        articlesReturned: callData.articlesReturned,
        responseTime: callData.responseTime,
        cacheHit: callData.cacheHit
      });

    } catch (error) {
      logger.error('💥 Failed to log API call to database', {
        callType: callData.callType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create compliance check record
   */
  async createComplianceCheck(
    revokedCount: number, 
    revokedArticleIds: string[], 
    status: 'compliant' | 'overdue' | 'error'
  ): Promise<void> {
    try {
      await db.insert(metabaseComplianceStatus).values({
        checkDate: new Date(),
        revokedArticlesCount: revokedCount,
        articlesProcessed: revokedArticleIds,
        status: status as any,
        nextScheduledCheck: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day
        errors: status === 'error' ? ['Compliance check failed'] : [],
        metadata: {
          processedArticleIds: revokedArticleIds,
          checkDuration: Date.now()
        }
      });

      logger.info('✅ Compliance check record created', {
        status,
        revokedCount,
        nextCheck: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

    } catch (error) {
      logger.error('💥 Failed to create compliance check record', {
        status,
        revokedCount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get compliance status for monitoring
   */
  async getComplianceStatus(): Promise<any> {
    try {
      // Get latest compliance check
      const latestCheck = await db
        .select()
        .from(metabaseComplianceStatus)
        .orderBy(desc(metabaseComplianceStatus.checkDate))
        .limit(1);

      // Get total article counts
      const articleStats = await db
        .select({
          totalArticles: sql<number>`count(*)`,
          activeArticles: sql<number>`count(*) FILTER (WHERE is_revoked = false)`,
          revokedArticles: sql<number>`count(*) FILTER (WHERE is_revoked = true)`
        })
        .from(metabaseArticles);

      const stats = articleStats[0];
      const lastCheck = latestCheck[0];
      
      // Check if compliance is overdue (>25 hours since last check)
      const isOverdue = lastCheck 
        ? (Date.now() - lastCheck.checkDate.getTime()) > (25 * 60 * 60 * 1000)
        : true;

      return {
        lastComplianceCheck: lastCheck?.checkDate || null,
        revokedArticlesProcessed: lastCheck?.revokedArticlesCount || 0,
        complianceStatus: isOverdue ? 'overdue' : (lastCheck?.status || 'unknown'),
        totalArticles: stats?.totalArticles || 0,
        activeArticles: stats?.activeArticles || 0,
        revokedArticles: stats?.revokedArticles || 0,
        nextScheduledCheck: lastCheck?.nextScheduledCheck || null,
        isOverdue,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('💥 Failed to get compliance status', { error });
      throw error;
    }
  }

  /**
   * Get recent API call statistics for sync monitoring
   */
  async getRecentApiCallStats(hours: number = 24): Promise<any> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const stats = await db
        .select({
          callType: metabaseApiCalls.callType,
          totalCalls: sql<number>`count(*)`,
          totalArticles: sql<number>`sum(articles_returned)`,
          avgResponseTime: sql<number>`avg(response_time)`,
          errorCount: sql<number>`count(*) FILTER (WHERE response_status >= 400)`,
          cacheHitRate: sql<number>`(count(*) FILTER (WHERE cache_hit = true)::float / count(*)) * 100`
        })
        .from(metabaseApiCalls)
        .where(gte(metabaseApiCalls.createdAt, since))
        .groupBy(metabaseApiCalls.callType)
        .orderBy(desc(sql`count(*)`));

      // Get latest successful call
      const latestCall = await db
        .select()
        .from(metabaseApiCalls)
        .where(and(
          gte(metabaseApiCalls.createdAt, since),
          eq(metabaseApiCalls.responseStatus, 200)
        ))
        .orderBy(desc(metabaseApiCalls.createdAt))
        .limit(1);

      return {
        period: `${hours} hours`,
        stats,
        lastSync: latestCall[0]?.createdAt || null,
        articlesRetrieved: stats.reduce((sum, stat) => sum + (stat.totalArticles || 0), 0),
        errors: stats.reduce((sum, stat) => sum + (stat.errorCount || 0), 0),
        lastError: null, // TODO: Get last error details
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('💥 Failed to get recent API call stats', { error });
      throw error;
    }
  }

  /**
   * Get article by ID
   */
  async getArticleById(id: string): Promise<any> {
    try {
      const article = await db
        .select()
        .from(metabaseArticles)
        .where(eq(metabaseArticles.id, id))
        .limit(1);

      return article[0] || null;
    } catch (error) {
      logger.error('💥 Failed to get article by ID', { id, error });
      return null;
    }
  }

  /**
   * Get articles by various filters for analytics
   */
  async getArticles(filters: {
    limit?: number;
    isRevoked?: boolean;
    source?: string;
    publishedAfter?: Date;
    publishedBefore?: Date;
  } = {}): Promise<any[]> {
    try {
      // Build conditions array
      const conditions = [];
      if (filters.isRevoked !== undefined) {
        conditions.push(eq(metabaseArticles.isRevoked, filters.isRevoked));
      }
      if (filters.source) {
        conditions.push(eq(metabaseArticles.source, filters.source));
      }
      if (filters.publishedAfter) {
        conditions.push(gte(metabaseArticles.publishedAt, filters.publishedAfter));
      }
      if (filters.publishedBefore) {
        conditions.push(lte(metabaseArticles.publishedAt, filters.publishedBefore));
      }

      // Execute query with or without conditions
      const query = conditions.length > 0
        ? db.select().from(metabaseArticles)
            .where(and(...conditions))
            .orderBy(desc(metabaseArticles.publishedAt))
            .limit(filters.limit || 100)
        : db.select().from(metabaseArticles)
            .orderBy(desc(metabaseArticles.publishedAt))
            .limit(filters.limit || 100);

      return await query;

    } catch (error) {
      logger.error('💥 Failed to get articles', { filters, error });
      return [];
    }
  }

  /**
   * Get analytics data for various analysis types
   */
  async getAnalytics(analysisType: string, limit: number = 10): Promise<any> {
    try {
      const totalArticlesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(metabaseArticles)
        .where(eq(metabaseArticles.isRevoked, false));
      
      const totalArticles = totalArticlesResult[0]?.count || 0;

      let results: any = {
        analysisType,
        dataSource: 'metabase_articles',
        totalArticles,
        generatedAt: new Date().toISOString()
      };

      switch (analysisType) {
        case 'topics':
          const topicsQuery = await db
            .select({
              topic: sql<string>`jsonb_array_elements_text(topics)`,
              count: sql<number>`count(*)`
            })
            .from(metabaseArticles)
            .where(eq(metabaseArticles.isRevoked, false))
            .groupBy(sql`jsonb_array_elements_text(topics)`)
            .orderBy(desc(sql`count(*)`))
            .limit(limit);

          results.results = topicsQuery.map((row: { topic: string; count: number }) => ({
            topic: row.topic,
            count: row.count,
            percentage: Number(((row.count / totalArticles) * 100).toFixed(2))
          }));
          break;

        case 'sources':
          const sourcesQuery = await db
            .select({
              source: metabaseArticles.source,
              count: sql<number>`count(*)`
            })
            .from(metabaseArticles)
            .where(eq(metabaseArticles.isRevoked, false))
            .groupBy(metabaseArticles.source)
            .orderBy(desc(sql`count(*)`))
            .limit(limit);

          results.results = sourcesQuery.map((row: { source: string; count: number }) => ({
            source: row.source,
            count: row.count,
            percentage: Number(((row.count / totalArticles) * 100).toFixed(2))
          }));
          break;

        case 'compliance':
          const complianceQuery = await db
            .select({
              totalArticles: sql<number>`count(*)`,
              revokedArticles: sql<number>`count(*) FILTER (WHERE is_revoked = true)`,
              activeArticles: sql<number>`count(*) FILTER (WHERE is_revoked = false)`,
              licensedArticles: sql<number>`count(*) FILTER (WHERE jsonb_array_length(licenses) > 0)`
            })
            .from(metabaseArticles);

          const compliance = complianceQuery[0];
          results.results = {
            totalArticles: compliance?.totalArticles || 0,
            activeArticles: compliance?.activeArticles || 0,
            revokedArticles: compliance?.revokedArticles || 0,
            revokedPercentage: compliance?.totalArticles 
              ? Number(((compliance.revokedArticles / compliance.totalArticles) * 100).toFixed(2))
              : 0,
            licensedArticles: compliance?.licensedArticles || 0,
            licensedPercentage: compliance?.totalArticles 
              ? Number(((compliance.licensedArticles / compliance.totalArticles) * 100).toFixed(2))
              : 0
          };
          break;

        default:
          results.results = [];
          results.error = `Unknown analysis type: ${analysisType}`;
      }

      return results;

    } catch (error) {
      logger.error('💥 Failed to get analytics', {
        analysisType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Data retention cleanup (run daily) 
   */
  async cleanupExpiredData(retentionDays: number = 365): Promise<{ articlesDeleted: number; apiCallsDeleted: number }> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // Delete old articles (optional - may want to keep for historical analysis)
      const expiredArticles = await db
        .delete(metabaseArticles)
        .where(and(
          eq(metabaseArticles.isRevoked, true),
          sql`updated_at < ${cutoffDate}`
        ))
        .returning({ id: metabaseArticles.id });

      // Delete old API call logs (keep for shorter period)
      const apiCallCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      const expiredApiCalls = await db
        .delete(metabaseApiCalls)
        .where(sql`created_at < ${apiCallCutoff}`)
        .returning({ id: metabaseApiCalls.id });

      const result = {
        articlesDeleted: expiredArticles.length,
        apiCallsDeleted: expiredApiCalls.length
      };

      logger.info('🧹 Metabase data retention cleanup completed', result);
      return result;

    } catch (error) {
      logger.error('💥 Failed to cleanup expired Metabase data', { error });
      throw error;
    }
  }

  /**
   * Get database health and statistics
   */
  async getDatabaseHealth(): Promise<any> {
    try {
      const articleStats = await db
        .select({
          totalArticles: sql<number>`count(*)`,
          activeArticles: sql<number>`count(*) FILTER (WHERE is_revoked = false)`,
          revokedArticles: sql<number>`count(*) FILTER (WHERE is_revoked = true)`,
          recentArticles: sql<number>`count(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')`
        })
        .from(metabaseArticles);

      const apiCallStats = await db
        .select({
          totalCalls: sql<number>`count(*)`,
          recentCalls: sql<number>`count(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')`,
          errorCalls: sql<number>`count(*) FILTER (WHERE response_status >= 400)`
        })
        .from(metabaseApiCalls);

      const complianceStats = await db
        .select({
          totalChecks: sql<number>`count(*)`,
          recentChecks: sql<number>`count(*) FILTER (WHERE check_date >= NOW() - INTERVAL '7 days')`
        })
        .from(metabaseComplianceStatus);

      return {
        articles: articleStats[0],
        apiCalls: apiCallStats[0],
        compliance: complianceStats[0],
        health: 'healthy',
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('💥 Failed to get database health', { error });
      return {
        health: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastUpdated: new Date().toISOString()
      };
    }
  }
}

export const metabaseDBService = new MetabaseDBService(); 