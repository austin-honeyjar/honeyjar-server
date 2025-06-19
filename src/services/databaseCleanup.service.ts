import { db } from '../db';
import { metabaseArticles, newsPipelineRuns, monitoringEvents, newsAuthorArticles } from '../db/schema';
import { lt, and, eq, sql } from 'drizzle-orm';
import logger from '../utils/logger';

export interface CleanupResult {
  oldArticlesRemoved: number;
  oldLogsRemoved: number;
  oldCacheCleared: number;
  oldComplianceRecordsArchived: number;
  authorRelationshipsCleared: number;
}

export class DatabaseCleanupService {
  
  /**
   * Main cleanup method - handles all cleanup tasks
   */
  async runCleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      oldArticlesRemoved: 0,
      oldLogsRemoved: 0,
      oldCacheCleared: 0,
      oldComplianceRecordsArchived: 0,
      authorRelationshipsCleared: 0
    };

    try {
      logger.info('Starting database cleanup process...');

      // 1. CRITICAL: Remove articles older than 24 hours (compliance requirement)
      result.oldArticlesRemoved = await this.cleanupOldArticles();
      
      // 2. Remove old pipeline logs (keep 30 days)
      result.oldLogsRemoved = await this.cleanupOldPipelineLogs();
      
      // 3. Remove old monitoring events (keep 7 days for non-critical)
      result.oldComplianceRecordsArchived = await this.cleanupOldMonitoringEvents();
      
      // 4. Clean up orphaned author-article relationships
      result.authorRelationshipsCleared = await this.cleanupOrphanedAuthorRelationships();

      logger.info('Database cleanup completed successfully', result);
      return result;

    } catch (error) {
      logger.error('Database cleanup failed', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * CRITICAL COMPLIANCE: Remove articles older than 24 hours
   * Keeps only:
   * - Articles with specific licenses that allow longer retention
   * - Revoked articles (legal requirement to track them)
   */
  private async cleanupOldArticles(): Promise<number> {
    try {
      logger.info('Starting 24-hour compliance article cleanup...');

      // Calculate 24 hours ago
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      // Define licenses that allow longer retention (customize based on your agreements)
      const longTermLicenses = ['NLA', 'Reuters Premium', 'AP Extended', 'Bloomberg Pro'];

      // Delete articles that are:
      // - Older than 24 hours
      // - NOT revoked (we must keep revoked articles for compliance)
      // - NOT licensed for long-term retention
      const deletedArticles = await db
        .delete(metabaseArticles)
        .where(
          and(
            lt(metabaseArticles.createdAt, twentyFourHoursAgo),
            eq(metabaseArticles.isRevoked, false), // Keep revoked articles
            // Check if article doesn't have long-term licenses
            sql`NOT (${metabaseArticles.licenses}::jsonb ?| array[${longTermLicenses.map(l => `'${l}'`).join(',')}])`
          )
        )
        .returning({ id: metabaseArticles.id });

      const deletedCount = deletedArticles.length;
      
      logger.info('24-hour compliance cleanup completed', {
        articlesDeleted: deletedCount,
        cutoffTime: twentyFourHoursAgo.toISOString(),
        retainedLicenses: longTermLicenses
      });

      return deletedCount;

    } catch (error) {
      logger.error('Failed to cleanup old articles', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Clean up old pipeline run logs (keep 30 days)
   */
  private async cleanupOldPipelineLogs(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deletedLogs = await db
        .delete(newsPipelineRuns)
        .where(lt(newsPipelineRuns.startedAt, thirtyDaysAgo))
        .returning({ id: newsPipelineRuns.id });

      logger.info('Pipeline logs cleanup completed', { 
        logsDeleted: deletedLogs.length,
        cutoffTime: thirtyDaysAgo.toISOString()
      });

      return deletedLogs.length;

    } catch (error) {
      logger.error('Failed to cleanup pipeline logs', { error: (error as Error).message });
      return 0;
    }
  }

  /**
   * Clean up old monitoring events (keep 7 days, except critical unresolved)
   */
  private async cleanupOldMonitoringEvents(): Promise<number> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Delete old events except critical unresolved ones
      const deletedEvents = await db
        .delete(monitoringEvents)
        .where(
          and(
            lt(monitoringEvents.createdAt, sevenDaysAgo),
            // Keep critical unresolved events
            sql`NOT (${monitoringEvents.severity} = 'critical' AND ${monitoringEvents.resolved} = false)`
          )
        )
        .returning({ id: monitoringEvents.id });

      logger.info('Monitoring events cleanup completed', { 
        eventsDeleted: deletedEvents.length,
        cutoffTime: sevenDaysAgo.toISOString()
      });

      return deletedEvents.length;

    } catch (error) {
      logger.error('Failed to cleanup monitoring events', { error: (error as Error).message });
      return 0;
    }
  }

  /**
   * Clean up orphaned author-article relationships where the article no longer exists
   */
  private async cleanupOrphanedAuthorRelationships(): Promise<number> {
    try {
      // Find author-article relationships where the article has been deleted
      const orphanedRelationships = await db
        .delete(newsAuthorArticles)
        .where(
          sql`NOT EXISTS (
            SELECT 1 FROM ${metabaseArticles} 
            WHERE ${metabaseArticles.id} = ${newsAuthorArticles.articleId}
          )`
        )
        .returning({ id: newsAuthorArticles.id });

      logger.info('Orphaned author relationships cleanup completed', { 
        relationshipsDeleted: orphanedRelationships.length
      });

      return orphanedRelationships.length;

    } catch (error) {
      logger.error('Failed to cleanup orphaned relationships', { error: (error as Error).message });
      return 0;
    }
  }

  /**
   * Check compliance status - how many articles are approaching 24-hour limit
   */
  async getComplianceStatus(): Promise<{
    articlesNearingExpiry: number;
    articlesOverdue: number;
    nextCleanupNeeded: Date;
  }> {
    try {
      const now = new Date();
      const twentyThreeHoursAgo = new Date(now.getTime() - (23 * 60 * 60 * 1000)); // 23 hours ago
      const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago

      // Count articles nearing expiry (between 23-24 hours old)
      const nearingExpiry = await db
        .select({ count: sql<number>`count(*)` })
        .from(metabaseArticles)
        .where(
          and(
            lt(metabaseArticles.createdAt, twentyThreeHoursAgo),
            eq(metabaseArticles.isRevoked, false)
          )
        );

      // Count articles that are overdue (over 24 hours old)
      const overdue = await db
        .select({ count: sql<number>`count(*)` })
        .from(metabaseArticles)
        .where(
          and(
            lt(metabaseArticles.createdAt, twentyFourHoursAgo),
            eq(metabaseArticles.isRevoked, false)
          )
        );

      const nextCleanup = new Date(now.getTime() + (60 * 60 * 1000)); // Next hour

      return {
        articlesNearingExpiry: nearingExpiry[0]?.count || 0,
        articlesOverdue: overdue[0]?.count || 0,
        nextCleanupNeeded: nextCleanup
      };

    } catch (error) {
      logger.error('Failed to get compliance status', { error: (error as Error).message });
      return {
        articlesNearingExpiry: 0,
        articlesOverdue: 0,
        nextCleanupNeeded: new Date()
      };
    }
  }
} 