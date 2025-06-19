import { db } from '../db';
import { 
  metabaseComplianceStatus, 
  metabaseRevokedArticles, 
  metabaseArticles, 
  metabaseApiCalls 
} from '../db/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import logger from '../utils/logger';

export interface ComplianceStatus {
  lastComplianceCheck: string;
  revokedArticlesProcessed: number;
  complianceStatus: 'compliant' | 'overdue' | 'error';
  nextScheduledCheck: string;
  errors?: any[];
}

export interface ApiCallLog {
  callType: 'articles' | 'search' | 'revoked' | 'compliance_clicks';
  endpoint: string;
  parameters: Record<string, any>;
  responseStatus?: number;
  responseTime?: number;
  articlesReturned?: number;
  errorMessage?: string;
  errorCode?: string;
  sequenceId?: string;
  rateLimitInfo?: Record<string, any>;
  cacheHit?: boolean;
  metadata?: Record<string, any>;
}

export class MetabaseComplianceService {
  
  /**
   * Get the latest compliance status
   */
  async getComplianceStatus(): Promise<ComplianceStatus> {
    try {
      logger.info('📋 Retrieving compliance status from database');

      // Get the most recent compliance check
      const latestCompliance = await db
        .select()
        .from(metabaseComplianceStatus)
        .orderBy(desc(metabaseComplianceStatus.checkDate))
        .limit(1);

      if (latestCompliance.length === 0) {
        // No compliance checks yet, return default status
        const nextCheck = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        logger.info('📋 No compliance checks found, returning default status');
        return {
          lastComplianceCheck: new Date().toISOString(),
          revokedArticlesProcessed: 0,
          complianceStatus: 'compliant',
          nextScheduledCheck: nextCheck
        };
      }

      const compliance = latestCompliance[0];
      
      // Check if compliance is overdue (more than 25 hours since last check)
      const lastCheckTime = new Date(compliance.checkDate).getTime();
      const now = Date.now();
      const hoursSinceLastCheck = (now - lastCheckTime) / (1000 * 60 * 60);
      
      let status: 'compliant' | 'overdue' | 'error' = compliance.status;
      if (hoursSinceLastCheck > 25) {
        status = 'overdue';
      }

      const result: ComplianceStatus = {
        lastComplianceCheck: compliance.checkDate.toISOString(),
        revokedArticlesProcessed: compliance.revokedArticlesCount,
        complianceStatus: status,
        nextScheduledCheck: compliance.nextScheduledCheck?.toISOString() || 
          new Date(lastCheckTime + 24 * 60 * 60 * 1000).toISOString(),
        errors: compliance.errors as any[]
      };

      logger.info('✅ Compliance status retrieved successfully', result);
      return result;

    } catch (error) {
      logger.error('💥 Error retrieving compliance status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create a new compliance check record
   */
  async createComplianceCheck(
    revokedArticlesCount: number, 
    articlesProcessed: string[] = [],
    status: 'compliant' | 'overdue' | 'error' = 'compliant',
    errors: any[] = []
  ): Promise<void> {
    try {
      logger.info('📝 Creating new compliance check record', {
        revokedArticlesCount,
        articlesProcessedCount: articlesProcessed.length,
        status
      });

      const nextCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.insert(metabaseComplianceStatus).values({
        checkDate: new Date(),
        revokedArticlesCount,
        articlesProcessed: articlesProcessed,
        status,
        nextScheduledCheck: nextCheck,
        errors,
        metadata: {
          autoCreated: true,
          processingTime: Date.now()
        }
      });

      logger.info('✅ Compliance check record created successfully');
    } catch (error) {
      logger.error('💥 Error creating compliance check record', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Store revoked articles
   */
  async storeRevokedArticles(revokedArticleIds: string[], complianceCheckId?: string): Promise<void> {
    try {
      logger.info('📝 Storing revoked articles', {
        count: revokedArticleIds.length,
        hasComplianceCheckId: !!complianceCheckId
      });

      const records = revokedArticleIds.map(articleId => ({
        articleId,
        revokedDate: new Date(),
        complianceCheckId: complianceCheckId || undefined,
        processed: false,
        metadata: {
          source: 'metabase_api',
          autoStored: true
        }
      }));

      if (records.length > 0) {
        await db.insert(metabaseRevokedArticles).values(records);
        logger.info('✅ Revoked articles stored successfully', { count: records.length });
      }

    } catch (error) {
      logger.error('💥 Error storing revoked articles', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Mark articles as revoked in the articles table
   */
  async markArticlesAsRevoked(articleIds: string[]): Promise<void> {
    try {
      logger.info('🚫 Marking articles as revoked', { count: articleIds.length });

      if (articleIds.length > 0) {
        // Update existing articles to mark them as revoked
        for (const articleId of articleIds) {
          await db
            .update(metabaseArticles)
            .set({ 
              isRevoked: true,
              updatedAt: new Date()
            })
            .where(eq(metabaseArticles.id, articleId));
        }

        logger.info('✅ Articles marked as revoked successfully', { count: articleIds.length });
      }

    } catch (error) {
      logger.error('💥 Error marking articles as revoked', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Log an API call for sync history
   */
  async logApiCall(callLog: ApiCallLog): Promise<void> {
    try {
      logger.debug('📊 Logging API call', {
        callType: callLog.callType,
        endpoint: callLog.endpoint,
        responseStatus: callLog.responseStatus
      });

      await db.insert(metabaseApiCalls).values({
        callType: callLog.callType,
        endpoint: callLog.endpoint,
        parameters: callLog.parameters,
        responseStatus: callLog.responseStatus,
        responseTime: callLog.responseTime,
        articlesReturned: callLog.articlesReturned || 0,
        errorMessage: callLog.errorMessage,
        errorCode: callLog.errorCode,
        sequenceId: callLog.sequenceId,
        rateLimitInfo: callLog.rateLimitInfo || {},
        cacheHit: callLog.cacheHit || false,
        metadata: callLog.metadata || {}
      });

      logger.debug('✅ API call logged successfully');
    } catch (error) {
      logger.error('💥 Error logging API call', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw here - logging failures shouldn't break the main flow
    }
  }

  /**
   * Get recent API call statistics for sync status
   */
  async getRecentApiCallStats(): Promise<{
    lastSync: string | null;
    articlesRetrieved: number;
    errors: number;
    lastError: string | null;
  }> {
    try {
      logger.debug('📊 Retrieving recent API call statistics');

      // Get the most recent successful API call
      const recentCalls = await db
        .select()
        .from(metabaseApiCalls)
        .orderBy(desc(metabaseApiCalls.createdAt))
        .limit(10);

      if (recentCalls.length === 0) {
        return {
          lastSync: null,
          articlesRetrieved: 0,
          errors: 0,
          lastError: null
        };
      }

      const lastSuccessfulCall = recentCalls.find(call => 
        call.responseStatus && call.responseStatus >= 200 && call.responseStatus < 300
      );

      const errors = recentCalls.filter(call => 
        call.responseStatus && call.responseStatus >= 400
      );

      const totalArticles = recentCalls
        .filter(call => call.responseStatus && call.responseStatus >= 200 && call.responseStatus < 300)
        .reduce((sum, call) => sum + (call.articlesReturned || 0), 0);

      return {
        lastSync: lastSuccessfulCall?.createdAt.toISOString() || null,
        articlesRetrieved: totalArticles,
        errors: errors.length,
        lastError: errors[0]?.errorMessage || null
      };

    } catch (error) {
      logger.error('💥 Error retrieving API call statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Store articles in the database
   */
  async storeArticles(articles: any[]): Promise<void> {
    try {
      logger.info('📝 Storing articles in database', { count: articles.length });

      if (articles.length === 0) return;

      const records = articles.map(article => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        content: article.content,
        url: article.url,
        source: article.source,
        publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
        estimatedPublishedDate: article.estimatedPublishedDate ? new Date(article.estimatedPublishedDate) : null,
        harvestDate: article.harvestDate ? new Date(article.harvestDate) : null,
        author: article.author,
        topics: article.topics || [],
        licenses: article.licenses || [],
        clickUrl: article.clickUrl,
        sequenceId: article.metadata?.sequenceId,
        metadata: article.metadata || {},
        isRevoked: false
      }));

      // Use upsert to handle duplicates
      for (const record of records) {
        await db
          .insert(metabaseArticles)
          .values(record)
          .onConflictDoUpdate({
            target: metabaseArticles.id,
            set: {
              title: record.title,
              summary: record.summary,
              content: record.content,
              url: record.url,
              source: record.source,
              publishedAt: record.publishedAt,
              estimatedPublishedDate: record.estimatedPublishedDate,
              harvestDate: record.harvestDate,
              author: record.author,
              topics: record.topics,
              licenses: record.licenses,
              clickUrl: record.clickUrl,
              sequenceId: record.sequenceId,
              metadata: record.metadata,
              updatedAt: new Date()
            }
          });
      }

      logger.info('✅ Articles stored successfully', { count: records.length });
    } catch (error) {
      logger.error('💥 Error storing articles', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
} 