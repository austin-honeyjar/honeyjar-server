# 🚀 News Pipeline Starter Code

This document provides the foundational code to get you started with the news pipeline implementation. Follow this after reviewing the main implementation plan.

## 📦 **Step 1: Install Dependencies**

```bash
cd honeyjar-server
npm install node-cron@^3.0.3 nodemailer@^6.9.7 @slack/webhook@^7.0.2
```

## 🔧 **Step 2: Environment Variables**

Add to your `.env` file:

```env
# News Pipeline Configuration
NEWS_PIPELINE_ENABLED=true
NEWS_PIPELINE_SCHEDULE_HOURS=4
NEWS_AUTHOR_SCORING_ENABLED=true
NEWS_CLEANUP_ENABLED=true

# Monitoring Configuration
MONITORING_ENABLED=true
COMPLIANCE_SLA_HOURS=24
ALERT_EMAIL=your-email@company.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/your-webhook-url

# Background Worker Configuration
WORKER_THREADS_ENABLED=true
MAX_WORKER_THREADS=2
```

## 📊 **Step 3: Database Schema Update**

First, add the new schema to your existing schema file:

### `src/db/schema.ts` - Add these tables

```typescript
// Add these enum definitions to your existing enums
export const pipelineRunStatusEnum = pgEnum('pipeline_run_status', ['running', 'completed', 'failed', 'partial']);
export const pipelineRunTypeEnum = pgEnum('pipeline_run_type', ['daily_sync', 'author_scoring', 'cleanup', 'manual']);
export const monitoringEventSeverityEnum = pgEnum('monitoring_event_severity', ['low', 'medium', 'high', 'critical']);

// Add these table definitions to your existing tables
export const newsAuthors = pgTable('news_authors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),
  organization: text('organization'),
  domain: text('domain'),
  relevanceScore: real('relevance_score').notNull().default(0.0),
  articleCount: integer('article_count').notNull().default(0),
  recentActivityScore: real('recent_activity_score').notNull().default(0.0),
  topics: jsonb('topics').notNull().default('[]'),
  locations: jsonb('locations').notNull().default('[]'),
  contactInfo: jsonb('contact_info').default('{}'),
  lastArticleDate: timestamp('last_article_date', { withTimezone: true }),
  firstSeenDate: timestamp('first_seen_date', { withTimezone: true }).defaultNow(),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const newsPipelineRuns = pgTable('news_pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runType: pipelineRunTypeEnum('run_type').notNull(),
  status: pipelineRunStatusEnum('status').notNull(),
  articlesProcessed: integer('articles_processed').default(0),
  articlesFiltered: integer('articles_filtered').default(0),
  authorsUpdated: integer('authors_updated').default(0),
  authorsCreated: integer('authors_created').default(0),
  recordsCleaned: integer('records_cleaned').default(0),
  executionTime: integer('execution_time'),
  sequenceIdStart: text('sequence_id_start'),
  sequenceIdEnd: text('sequence_id_end'),
  errorMessage: text('error_message'),
  errorCode: text('error_code'),
  filtersApplied: jsonb('filters_applied').default('{}'),
  metadata: jsonb('metadata').default('{}'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const monitoringEvents = pgTable('monitoring_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(),
  severity: monitoringEventSeverityEnum('severity').notNull(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  details: jsonb('details').default('{}'),
  affectedServices: jsonb('affected_services').default('[]'),
  resolved: boolean('resolved').default(false),
  resolvedBy: text('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  escalated: boolean('escalated').default(false),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  notificationSent: boolean('notification_sent').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const newsAuthorArticles = pgTable('news_author_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => newsAuthors.id, { onDelete: 'cascade' }),
  articleId: text('article_id').notNull().references(() => metabaseArticles.id, { onDelete: 'cascade' }),
  role: text('role').default('author'),
  relevanceScore: real('relevance_score').default(1.0),
  extractedFrom: text('extracted_from').default('byline'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Run the migration:

```bash
npm run db:generate
npm run db:push
```

## 🏗️ **Step 4: Basic Worker Infrastructure**

### `src/workers/backgroundWorker.ts`

```typescript
import cron from 'node-cron';
import logger from '../utils/logger';
import { MetabaseService } from '../services/metabase.service';
import { NewsPipelineDBService } from '../services/newsPipelineDB.service';
import { MonitoringService } from '../services/monitoring.service';

export class BackgroundWorker {
  private metabaseService: MetabaseService;
  private dbService: NewsPipelineDBService;
  private monitoringService: MonitoringService;
  private isInitialized: boolean = false;

  constructor() {
    this.metabaseService = new MetabaseService();
    this.dbService = new NewsPipelineDBService();
    this.monitoringService = new MonitoringService();
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
      logger.error('Failed to initialize background worker', { error: error.message });
      throw error;
    }
  }

  private async scheduleJobs(): Promise<void> {
    const scheduleHours = parseInt(process.env.NEWS_PIPELINE_SCHEDULE_HOURS || '4');
    
    // Every N hours - Fetch new articles and process authors
    cron.schedule(`0 */${scheduleHours} * * *`, async () => {
      logger.info('Running scheduled news pipeline sync');
      await this.runNewsPipeline();
    });

    // Daily at 3 AM - Update author relevance scores
    cron.schedule('0 3 * * *', async () => {
      logger.info('Running scheduled author scoring update');
      await this.updateAuthorScores();
    });

    // Weekly cleanup - Sunday at 1 AM
    cron.schedule('0 1 * * 0', async () => {
      logger.info('Running scheduled database cleanup');
      await this.runDatabaseCleanup();
    });

    logger.info(`News pipeline jobs scheduled (every ${scheduleHours} hours for sync)`);
  }

  async runNewsPipeline(): Promise<void> {
    const runId = await this.dbService.startPipelineRun('daily_sync');
    const startTime = Date.now();

    try {
      logger.info('Starting news pipeline run', { runId });

      // 1. Get the last sequence ID to avoid duplicates
      const lastSequenceId = await this.dbService.getLastSequenceId();

      // 2. Fetch new articles from Metabase
      const articlesResponse = await this.metabaseService.getArticles({
        limit: 200,
        sequenceId: lastSequenceId
      });

      if (!articlesResponse.success || !articlesResponse.articles) {
        throw new Error('Failed to fetch articles from Metabase');
      }

      // 3. Filter articles by location (US-focused)
      const locationFilteredArticles = this.filterArticlesByLocation(articlesResponse.articles);
      
      // 4. Filter articles by relevant topics
      const topicFilteredArticles = this.filterArticlesByTopics(locationFilteredArticles);

      // 5. Extract and process authors from filtered articles
      const processedAuthors = await this.processAuthorsFromArticles(topicFilteredArticles);

      // 6. Update pipeline run with results
      const executionTime = Date.now() - startTime;
      await this.dbService.updatePipelineRun(runId, {
        status: 'completed',
        articlesProcessed: articlesResponse.articles.length,
        articlesFiltered: topicFilteredArticles.length,
        authorsUpdated: processedAuthors.authorsUpdated,
        authorsCreated: processedAuthors.authorsCreated,
        executionTime,
        sequenceIdEnd: articlesResponse.lastSequenceId
      });

      logger.info('News pipeline completed successfully', {
        runId,
        totalArticles: articlesResponse.articles.length,
        filteredArticles: topicFilteredArticles.length,
        authorsProcessed: processedAuthors.authorsUpdated + processedAuthors.authorsCreated,
        executionTimeMs: executionTime
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.dbService.updatePipelineRun(runId, {
        status: 'failed',
        errorMessage: error.message,
        executionTime
      });

      // Create monitoring alert for pipeline failure
      await this.monitoringService.createAlert('high', 'News Pipeline Failed', {
        runId,
        error: error.message,
        executionTime
      });

      logger.error('News pipeline run failed', { runId, error: error.message });
      throw error;
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

    for (const article of articles) {
      if (!article.author || article.author.trim() === '') continue;

      try {
        const authorResult = await this.dbService.createOrUpdateAuthor(article);
        
        if (authorResult.created) {
          authorsCreated++;
        } else {
          authorsUpdated++;
        }

        // Create author-article relationship
        await this.dbService.createAuthorArticleRelationship(
          authorResult.authorId, 
          article.id
        );

      } catch (error) {
        logger.warn('Failed to process author', { 
          author: article.author, 
          articleId: article.id,
          error: error.message 
        });
      }
    }

    return { authorsUpdated, authorsCreated };
  }

  private async updateAuthorScores(): Promise<void> {
    // This will be implemented in the AuthorScoringService
    logger.info('Author scoring update scheduled - implementation pending');
  }

  private async runDatabaseCleanup(): Promise<void> {
    // This will be implemented in the DatabaseCleanupService  
    logger.info('Database cleanup scheduled - implementation pending');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down background worker...');
    // Clean shutdown logic
    this.isInitialized = false;
  }
}

// Export singleton instance
export const backgroundWorker = new BackgroundWorker();
```

## 🗄️ **Step 5: Database Service**

### `src/services/newsPipelineDB.service.ts`

```typescript
import { db } from '../db';
import { newsAuthors, newsPipelineRuns, newsAuthorArticles, monitoringEvents } from '../db/schema';
import { eq, desc, and, gte, lt } from 'drizzle-orm';
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
      logger.error('Failed to start pipeline run', { runType, error: error.message });
      throw error;
    }
  }

  async updatePipelineRun(runId: string, updates: {
    status?: string;
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
      logger.error('Failed to update pipeline run', { runId, error: error.message });
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
      logger.error('Failed to get last sequence ID', { error: error.message });
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
        error: error.message 
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
        error: error.message 
      });
      // Don't throw - this isn't critical enough to fail the whole pipeline
    }
  }

  // Author retrieval for API endpoints
  async getTopAuthorsByRelevance(limit: number = 20): Promise<any[]> {
    try {
      const authors = await db
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
        .where(gte(newsAuthors.relevanceScore, 1.0))
        .orderBy(desc(newsAuthors.relevanceScore), desc(newsAuthors.updatedAt))
        .limit(limit);

      return authors;
    } catch (error) {
      logger.error('Failed to get top authors', { error: error.message });
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
      logger.error('Failed to create monitoring event', { error: error.message });
      throw error;
    }
  }
}
```

## 🚨 **Step 6: Basic Monitoring Service**

### `src/services/monitoring.service.ts`

```typescript
import logger from '../utils/logger';
import { NewsPipelineDBService } from './newsPipelineDB.service';

export class MonitoringService {
  private dbService: NewsPipelineDBService;
  private intervalIds: NodeJS.Timeout[] = [];

  constructor() {
    this.dbService = new NewsPipelineDBService();
  }

  async initialize(): Promise<void> {
    if (process.env.MONITORING_ENABLED !== 'true') {
      logger.info('Monitoring service disabled');
      return;
    }

    logger.info('Initializing monitoring service...');

    // Start monitoring intervals
    this.startHealthChecks();
    
    logger.info('Monitoring service initialized');
  }

  private startHealthChecks(): void {
    // Check system health every 5 minutes
    const healthCheckInterval = setInterval(async () => {
      await this.checkSystemHealth();
    }, 5 * 60 * 1000);

    this.intervalIds.push(healthCheckInterval);
  }

  private async checkSystemHealth(): Promise<void> {
    try {
      // Basic health checks - expand as needed
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      // Check if memory usage is too high (>1GB)
      if (memoryUsage.heapUsed > 1024 * 1024 * 1024) {
        await this.createAlert('medium', 'High Memory Usage', {
          memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          uptime: `${Math.round(uptime / 3600)}h`
        });
      }

      // Additional health checks can be added here

    } catch (error) {
      logger.error('Health check failed', { error: error.message });
    }
  }

  async createAlert(severity: string, title: string, details: any): Promise<void> {
    try {
      const eventId = await this.dbService.createMonitoringEvent({
        eventType: 'alert',
        severity,
        source: 'monitoring_service',
        title,
        message: title,
        details
      });

      logger.warn(`Monitoring alert created: ${title}`, { 
        eventId, 
        severity, 
        details 
      });

      // TODO: Send actual notifications (email/Slack) for high/critical alerts
      if (severity === 'critical' || severity === 'high') {
        logger.error(`CRITICAL ALERT: ${title}`, details);
      }

    } catch (error) {
      logger.error('Failed to create monitoring alert', { error: error.message });
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down monitoring service...');
    
    // Clear all intervals
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];
  }
}
```

## 🔌 **Step 7: Server Integration**

Update your main server file to initialize the background worker:

### `src/server.ts` - Add to your existing server initialization

```typescript
// Add this import at the top
import { backgroundWorker } from './workers/backgroundWorker';

// Add this after your existing server setup, before server.listen()
async function initializeBackgroundServices() {
  try {
    await backgroundWorker.initialize();
    logger.info('Background services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize background services', { error: error.message });
    // Don't fail the server startup for background worker issues
  }
}

// Call this before starting the server
await initializeBackgroundServices();

// Add graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await backgroundWorker.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await backgroundWorker.shutdown();
  process.exit(0);
});
```

## 🧪 **Step 8: Quick Test**

1. **Apply the database schema:**
   ```bash
   npm run db:push
   ```

2. **Start your server:**
   ```bash
   npm run dev
   ```

3. **Check the logs** - you should see:
   ```
   Background worker initialized successfully
   News pipeline jobs scheduled (every 4 hours for sync)
   Monitoring service initialized
   ```

4. **Test manual pipeline run** (add this temporary endpoint for testing):
   ```typescript
   // Add to your routes for testing
   router.post('/test/pipeline', async (req, res) => {
     try {
       await backgroundWorker.runNewsPipeline();
       res.json({ status: 'success', message: 'Pipeline run completed' });
     } catch (error) {
       res.status(500).json({ status: 'error', message: error.message });
     }
   });
   ```

## 🎯 **Next Steps**

After this basic setup is working:

1. **Week 1**: Implement author scoring algorithm
2. **Week 2**: Add API endpoints for workflow engine integration  
3. **Week 3**: Add production monitoring and GCloud Scheduler

This starter code gives you a solid foundation for the news pipeline with background processing that runs independently of your main server loop.

**Ready to implement? Start with the database schema, then add the background worker!** 