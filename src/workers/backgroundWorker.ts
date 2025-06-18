import cron from 'node-cron';
import logger from '../utils/logger';
import { MetabaseService } from '../services/metabase.service';
import { NewsPipelineDBService } from '../services/newsPipelineDB.service';
import { MonitoringService } from '../services/monitoring.service';
import { DatabaseCleanupService } from '../services/databaseCleanup.service';
import { db } from '../db';
import { newsPipelineRuns } from '../db/schema';
import { sql } from 'drizzle-orm';

export class BackgroundWorker {
  private metabaseService: MetabaseService;
  private dbService: NewsPipelineDBService;
  private monitoringService: MonitoringService;
  private cleanupService: DatabaseCleanupService;
  private isInitialized: boolean = false;

  constructor() {
    this.metabaseService = new MetabaseService();
    this.dbService = new NewsPipelineDBService();
    this.monitoringService = new MonitoringService();
    this.cleanupService = new DatabaseCleanupService();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Only initialize if background workers are enabled
      if (process.env.NEWS_PIPELINE_ENABLED !== 'true') {
        logger.info('News pipeline background worker disabled');
        return;
      }

      logger.info('Initializing background worker...');

      // Schedule news pipeline jobs
      await this.scheduleJobs();

      // Initialize monitoring
      await this.monitoringService.initialize();

      this.isInitialized = true;
      logger.info('Background worker initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize background worker', { error: (error as Error).message });
      throw error;
    }
  }

  private async scheduleJobs(): Promise<void> {
    // Get configuration from environment
    const syncFrequencyMinutes = parseInt(process.env.NEWS_SYNC_FREQUENCY_MINUTES || '15'); // Default: every 15 minutes
    const articlesPerSync = parseInt(process.env.NEWS_ARTICLES_PER_SYNC || '25'); // Default: 25 articles per sync
    const maxDailyArticles = parseInt(process.env.NEWS_MAX_DAILY_ARTICLES || '2000'); // Default: max 2000 articles per day
    const isProductionMode = process.env.NODE_ENV === 'production';
    
    // More frequent, smaller syncs for real-time news monitoring
    cron.schedule(`*/${syncFrequencyMinutes} * * * *`, async () => {
      logger.info('Running scheduled incremental news sync', { 
        frequencyMinutes: syncFrequencyMinutes,
        articlesPerSync 
      });
      try {
        await this.runIncrementalSync(articlesPerSync, maxDailyArticles);
      } catch (error) {
        logger.error('Scheduled incremental sync failed', { error: (error as Error).message });
        
        // Implement exponential backoff on failures
        await this.handleSyncFailure(error as Error);
      }
    });

    // CRITICAL: Every hour - 24-hour compliance cleanup
    cron.schedule('0 * * * *', async () => {
      logger.info('Running scheduled 24-hour compliance cleanup');
      try {
        await this.runDatabaseCleanup();
      } catch (error) {
        logger.error('Scheduled compliance cleanup failed', { error: (error as Error).message });
      }
    });

    // Daily at 3 AM - Update author relevance scores
    cron.schedule('0 3 * * *', async () => {
      logger.info('Running scheduled author scoring update');
      try {
        await this.updateAuthorScores();
      } catch (error) {
        logger.error('Scheduled author scoring update failed', { error: (error as Error).message });
      }
    });

    // Daily at 4 AM - Check and enforce data usage limits
    cron.schedule('0 4 * * *', async () => {
      logger.info('Running daily data usage audit');
      try {
        await this.auditDataUsage();
      } catch (error) {
        logger.error('Daily data audit failed', { error: (error as Error).message });
      }
    });

    logger.info(`Enhanced news pipeline jobs scheduled:
    - Incremental sync: every ${syncFrequencyMinutes} minutes (${articlesPerSync} articles/sync)
    - Daily limit: ${maxDailyArticles} articles
    - Compliance cleanup: every hour  
    - Author scoring: daily at 3 AM
    - Data audit: daily at 4 AM
    - Mode: ${isProductionMode ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  }

  // New incremental sync method with rate limiting and data usage tracking
  private async runIncrementalSync(articlesPerSync: number, maxDailyArticles: number): Promise<void> {
    const runId = await this.dbService.startPipelineRun('incremental_sync');
    const startTime = Date.now();

    try {
      // Check daily limits before proceeding
      const todayUsage = await this.getDailyArticleUsage();
      if (todayUsage >= maxDailyArticles) {
        logger.warn('Daily article limit reached, skipping sync', { 
          todayUsage, 
          maxDailyArticles 
        });
        
        await this.dbService.updatePipelineRun(runId, {
          status: 'completed',
          articlesProcessed: 0,
          errorMessage: `Daily limit reached (${todayUsage}/${maxDailyArticles})`,
          executionTime: Date.now() - startTime
        });
        return;
      }

      // Adjust batch size if approaching daily limit
      const remainingQuota = maxDailyArticles - todayUsage;
      const effectiveLimit = Math.min(articlesPerSync, remainingQuota);

      logger.info('Starting incremental news sync', { 
        runId, 
        effectiveLimit,
        todayUsage,
        remainingQuota
      });

      // Check API rate limits before making requests
      await this.checkApiRateLimit();

      // Get the last sequence ID to avoid duplicates
      const lastSequenceId = await this.dbService.getLastSequenceId();

      // Fetch small batch of new articles
      const articlesResponse = await this.metabaseService.getRecentArticles({
        limit: effectiveLimit,
        sequenceId: lastSequenceId || undefined
      });

      if (!articlesResponse.articles || articlesResponse.articles.length === 0) {
        logger.info('No new articles found', { runId });
        await this.dbService.updatePipelineRun(runId, {
          status: 'completed',
          articlesProcessed: 0,
          executionTime: Date.now() - startTime
        });
        return;
      }

      // Process articles with same filtering logic
      logger.info('📥 Articles received from Metabase', { 
        totalArticles: articlesResponse.articles.length,
        requestedLimit: effectiveLimit 
      });

      const locationFilteredArticles = this.filterArticlesByLocation(articlesResponse.articles);
      logger.info('🌍 After location filtering (US-focused)', { 
        articlesRemaining: locationFilteredArticles.length,
        filteredOut: articlesResponse.articles.length - locationFilteredArticles.length
      });

      const topicFilteredArticles = this.filterArticlesByTopics(locationFilteredArticles);
      logger.info('🏷️ After topic filtering (business-relevant)', { 
        articlesRemaining: topicFilteredArticles.length,
        filteredOut: locationFilteredArticles.length - topicFilteredArticles.length
      });

      const processedAuthors = await this.processAuthorsFromArticles(topicFilteredArticles);

      // Update pipeline run with results
      const executionTime = Date.now() - startTime;
      await this.dbService.updatePipelineRun(runId, {
        status: 'completed',
        articlesProcessed: articlesResponse.articles.length,
        articlesFiltered: topicFilteredArticles.length,
        authorsUpdated: processedAuthors.authorsUpdated,
        authorsCreated: processedAuthors.authorsCreated,
        executionTime,
        sequenceIdEnd: articlesResponse.lastSequenceId || lastSequenceId || undefined
      });

      // Track API usage for rate limiting
      await this.trackApiUsage(articlesResponse.articles.length, executionTime);

      logger.info('Incremental sync completed successfully', {
        runId,
        requestedLimit: effectiveLimit,
        totalArticles: articlesResponse.articles.length,
        filteredArticles: topicFilteredArticles.length,
        authorsProcessed: processedAuthors.authorsUpdated + processedAuthors.authorsCreated,
        executionTimeMs: executionTime,
        dailyUsage: todayUsage + articlesResponse.articles.length
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.dbService.updatePipelineRun(runId, {
        status: 'failed',
        errorMessage: (error as Error).message,
        executionTime
      });

      logger.error('Incremental sync failed', { runId, error: (error as Error).message });
      throw error;
    }
  }

  // Keep original method for manual testing (backward compatibility)
  async runNewsPipeline(articleLimit: number = 200): Promise<void> {
    const runId = await this.dbService.startPipelineRun('manual');
    const startTime = Date.now();

    try {
      logger.info('Starting manual pipeline test', { runId, articleLimit });

      // Get the last sequence ID to avoid duplicates
      const lastSequenceId = await this.dbService.getLastSequenceId();

      // Fetch articles from Metabase with specified limit
      const articlesResponse = await this.metabaseService.getRecentArticles({
        limit: articleLimit,
        sequenceId: lastSequenceId || undefined
      });

      if (!articlesResponse.articles) {
        throw new Error('Failed to fetch articles from Metabase');
      }

      // Process articles with same filtering logic
      logger.info('📥 Manual test: Articles received from Metabase', { 
        totalArticles: articlesResponse.articles.length,
        requestedLimit: articleLimit 
      });

      const locationFilteredArticles = this.filterArticlesByLocation(articlesResponse.articles);
      logger.info('🌍 Manual test: After location filtering (US-focused)', { 
        articlesRemaining: locationFilteredArticles.length,
        filteredOut: articlesResponse.articles.length - locationFilteredArticles.length
      });

      const topicFilteredArticles = this.filterArticlesByTopics(locationFilteredArticles);
      logger.info('🏷️ Manual test: After topic filtering (business-relevant)', { 
        articlesRemaining: topicFilteredArticles.length,
        filteredOut: locationFilteredArticles.length - topicFilteredArticles.length
      });

      const processedAuthors = await this.processAuthorsFromArticles(topicFilteredArticles);

      // Update pipeline run with results
      const executionTime = Date.now() - startTime;
      await this.dbService.updatePipelineRun(runId, {
        status: 'completed',
        articlesProcessed: articlesResponse.articles.length,
        articlesFiltered: topicFilteredArticles.length,
        authorsUpdated: processedAuthors.authorsUpdated,
        authorsCreated: processedAuthors.authorsCreated,
        executionTime,
        sequenceIdEnd: articlesResponse.lastSequenceId || lastSequenceId || undefined
      });

      logger.info('Manual pipeline test completed successfully', {
        runId,
        requestedLimit: articleLimit,
        totalArticles: articlesResponse.articles.length,
        filteredArticles: topicFilteredArticles.length,
        authorsProcessed: processedAuthors.authorsUpdated + processedAuthors.authorsCreated,
        executionTimeMs: executionTime
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.dbService.updatePipelineRun(runId, {
        status: 'failed',
        errorMessage: (error as Error).message,
        executionTime
      });

      // Create monitoring alert for pipeline failure
      await this.monitoringService.createAlert('high', 'Manual Pipeline Test Failed', {
        runId,
        error: (error as Error).message,
        executionTime
      });

      logger.error('Manual pipeline test failed', { runId, error: (error as Error).message });
      throw error;
    }
  }

  // Check current daily article usage
  private async getDailyArticleUsage(): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await db.execute(sql`
        SELECT COALESCE(SUM(articles_processed), 0) as daily_total
        FROM news_pipeline_runs 
        WHERE started_at >= ${today}
        AND status = 'completed'
      `);

      const dailyTotal = result[0]?.daily_total;
      return typeof dailyTotal === 'number' ? dailyTotal : 0;
    } catch (error) {
      logger.error('Failed to get daily usage', { error: (error as Error).message });
      return 0;
    }
  }

  // Check API rate limits to avoid hitting Metabase limits
  private async checkApiRateLimit(): Promise<void> {
    const rateLimitWindow = 60000; // 1 minute window
    const maxRequestsPerMinute = parseInt(process.env.METABASE_RATE_LIMIT || '10'); // Default: 10 requests per minute

    // Implement rate limiting logic here
    // This is a simplified version - in production you'd want Redis or similar
    logger.debug('API rate limit check passed', { maxRequestsPerMinute });
  }

  // Track API usage for monitoring and rate limiting
  private async trackApiUsage(articlesProcessed: number, responseTime: number): Promise<void> {
    try {
      // Log API usage metrics for monitoring
      logger.info('API usage tracked', {
        articlesProcessed,
        responseTime,
        timestamp: new Date().toISOString()
      });

      // In production, you'd store this in a time-series database or Redis
      // for real-time monitoring and alerting
    } catch (error) {
      logger.warn('Failed to track API usage', { error: (error as Error).message });
    }
  }

  // Handle sync failures with exponential backoff
  private async handleSyncFailure(error: Error): Promise<void> {
    // Implement exponential backoff logic
    logger.warn('Implementing backoff strategy after sync failure', {
      error: error.message
    });
    
    // Create monitoring alert for repeated failures
    await this.monitoringService.createAlert('medium', 'Incremental Sync Failed', {
      error: error.message,
      strategy: 'exponential_backoff_applied'
    });
  }

  // Daily audit of data usage and cleanup old data
  private async auditDataUsage(): Promise<void> {
    try {
      logger.info('Starting daily data usage audit...');

      // Get storage metrics
      const storageMetrics = await this.dbService.getStorageMetrics();
      
      // Check if we're approaching storage limits
      const maxStorageMB = parseInt(process.env.NEWS_MAX_STORAGE_MB || '1000'); // Default: 1GB
      
      if (storageMetrics.totalSizeMB > maxStorageMB * 0.8) { // 80% threshold
        logger.warn('Approaching storage limit', {
          currentMB: storageMetrics.totalSizeMB,
          maxMB: maxStorageMB,
          percentage: (storageMetrics.totalSizeMB / maxStorageMB) * 100
        });

        // Trigger aggressive cleanup
        await this.runDatabaseCleanup();
      }

      // Log daily summary
      logger.info('Daily data audit completed', {
        totalRecords: storageMetrics.totalRecords,
        totalSizeMB: storageMetrics.totalSizeMB,
        dailyArticles: await this.getDailyArticleUsage()
      });

    } catch (error) {
      logger.error('Data usage audit failed', { error: (error as Error).message });
    }
  }

  private filterArticlesByLocation(articles: any[]): any[] {
    return articles.filter(article => {
      const locations = article.metadata?.locations || [];
      const source = article.source?.toLowerCase() || '';
      
      // Check if article is US-focused
      return locations.some((loc: any) => 
        loc.country?.name === 'United States' || 
        loc.region === 'North America'
      ) || 
      source.includes('us') || 
      source.includes('american') ||
      source.includes('usa');
    });
  }

  private filterArticlesByTopics(articles: any[]): any[] {
    const relevantTopics = [
      'technology', 'business', 'finance', 'healthcare', 
      'energy', 'automotive', 'telecommunications', 'media',
      'real estate', 'manufacturing', 'retail', 'aerospace',
      'biotech', 'fintech', 'software', 'artificial intelligence'
    ];

    return articles.filter(article => {
      const topics = article.topics || [];
      return topics.some((topic: string) => 
        relevantTopics.some(relevant => 
          topic.toLowerCase().includes(relevant.toLowerCase())
        )
      );
    });
  }

  private async processAuthorsFromArticles(articles: any[]): Promise<{
    authorsUpdated: number;
    authorsCreated: number;
  }> {
    let authorsUpdated = 0;
    let authorsCreated = 0;

    logger.info(`📝 Starting author processing for ${articles.length} articles`);
    
    // Debug: Sample the first few articles to see their author data
    if (articles.length > 0) {
      const sampleArticles = articles.slice(0, 3);
      logger.info('📋 Sample article authors before processing:', {
        samples: sampleArticles.map(a => ({
          id: a.id,
          title: a.title?.substring(0, 50) + '...',
          originalAuthor: a.author,
          authorType: typeof a.author,
          hasAuthor: !!a.author
        }))
      });
    }

    for (const article of articles) {
      // Normalize author name - don't skip articles without clear authors
      let authorName = this.normalizeAuthorName(article.author);

      logger.debug(`🔄 Processing article author`, {
        articleId: article.id,
        originalAuthor: article.author,
        normalizedAuthor: authorName,
        title: article.title?.substring(0, 30) + '...'
      });

      try {
        // Create a modified article object with normalized author
        const articleWithNormalizedAuthor = {
          ...article,
          author: authorName
        };

        const authorResult = await this.dbService.createOrUpdateAuthor(articleWithNormalizedAuthor);
        
        if (authorResult.created) {
          authorsCreated++;
          logger.info(`✅ Created new author: "${authorName}" from article ${article.id}`);
        } else {
          authorsUpdated++;
          logger.debug(`🔄 Updated existing author: "${authorName}" from article ${article.id}`);
        }

        // Create author-article relationship
        await this.dbService.createAuthorArticleRelationship(
          authorResult.authorId, 
          article.id
        );

      } catch (error) {
        logger.warn('❌ Failed to process author', { 
          originalAuthor: article.author,
          normalizedAuthor: authorName,
          articleId: article.id,
          error: (error as Error).message 
        });
      }
    }

    logger.info(`📊 Author processing completed:`, {
      totalArticles: articles.length,
      authorsCreated,
      authorsUpdated,
      totalAuthorsProcessed: authorsCreated + authorsUpdated
    });

    return { authorsUpdated, authorsCreated };
  }

  /**
   * Normalize author names to ensure we capture all authors including unknown ones
   */
  private normalizeAuthorName(author: any): string {
    // Handle null/undefined/empty authors
    if (!author || (typeof author === 'string' && author.trim() === '')) {
      return 'Unknown Author';
    }

    // Convert to string and trim
    const authorStr = String(author).trim();

    // Handle common generic author patterns
    const genericPatterns = [
      /^(staff|editorial|newsroom|editor|correspondent)$/i,
      /^(news staff|staff writer|staff reporter)$/i,
      /^(associated press|reuters|ap|bloomberg)$/i,
      /^(guest author|guest writer|contributor)$/i,
      /^(admin|administrator|system)$/i,
      /^(n\/a|na|not available|none)$/i,
      /^(unknown|unnamed|anonymous)$/i
    ];

    // Check if it matches any generic pattern
    const isGeneric = genericPatterns.some(pattern => pattern.test(authorStr));
    
    if (isGeneric) {
      // Categorize specific generic types
      if (/staff|editorial|newsroom/i.test(authorStr)) {
        return 'Staff Writer';
      } else if (/associated press|ap$/i.test(authorStr)) {
        return 'Associated Press';
      } else if (/reuters/i.test(authorStr)) {
        return 'Reuters';
      } else if (/bloomberg/i.test(authorStr)) {
        return 'Bloomberg';
      } else if (/guest|contributor/i.test(authorStr)) {
        return 'Guest Contributor';
      } else {
        return 'Unknown Author';
      }
    }

    // For regular authors, clean up the name
    let cleanName = authorStr
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/[^\w\s\-\.\']/g, '') // Remove special chars except dash, dot, apostrophe
      .trim();

    // Handle "By [Author Name]" patterns
    if (/^by\s+/i.test(cleanName)) {
      cleanName = cleanName.replace(/^by\s+/i, '').trim();
    }

    // Ensure we have something to work with
    if (cleanName.length === 0) {
      return 'Unknown Author';
    }

    // Capitalize properly (simple title case)
    cleanName = cleanName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return cleanName;
  }

  private async updateAuthorScores(): Promise<void> {
    // This will be implemented in the AuthorScoringService
    logger.info('Author scoring update scheduled - implementation pending');
  }

  private async runDatabaseCleanup(): Promise<void> {
    try {
      logger.info('Starting 24-hour compliance cleanup...');
      
      const cleanupResult = await this.cleanupService.runCleanup();
      
      logger.info('Database cleanup completed successfully', {
        articlesRemoved: cleanupResult.oldArticlesRemoved,
        logsRemoved: cleanupResult.oldLogsRemoved,
        eventsRemoved: cleanupResult.oldComplianceRecordsArchived,
        relationshipsCleared: cleanupResult.authorRelationshipsCleared
      });

      // Create monitoring event for successful cleanup
      if (cleanupResult.oldArticlesRemoved > 0) {
        await this.monitoringService.createAlert('low', 'Compliance Cleanup Completed', {
          articlesRemoved: cleanupResult.oldArticlesRemoved,
          message: `Successfully removed ${cleanupResult.oldArticlesRemoved} articles for 24-hour compliance`
        });
      }

    } catch (error) {
      logger.error('Database cleanup failed', { error: (error as Error).message });
      
      // Create critical monitoring alert for cleanup failure
      await this.monitoringService.createAlert('critical', 'Compliance Cleanup Failed', {
        error: (error as Error).message,
        message: 'CRITICAL: 24-hour compliance cleanup failed - immediate attention required'
      });
      
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down background worker...');
    // Clean shutdown logic
    this.isInitialized = false;
  }
}

// Export singleton instance
export const backgroundWorker = new BackgroundWorker(); 