# 📰 News Pipeline & Production Implementation Plan

## 🎯 **Project Overview**

Implement an automated news pipeline that runs as a background process within the existing Node.js application (no microservices) to:
1. **Automated News Ingestion**: Fetch and filter articles by topic/location (US)
2. **Author Relevance Scoring**: Rank authors by relevance and activity
3. **Background Processing**: Separate loop from main server
4. **Workflow Integration**: API endpoints for workflow engine access
5. **Database Management**: Size control and compliance cleanup
6. **Production Automation**: GCloud Scheduler + monitoring/alerting

---

## 🏗️ **Architecture Strategy - Single Application**

### **Background Worker Pattern**
```typescript
// Single Node.js app with background workers
┌─────────────────────────────────────────┐
│           Main Express Server           │
│  ┌─────────────────────────────────────┐ │
│  │        API Routes & Workflows       │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │       Background Workers            │ │
│  │  • News Pipeline Worker             │ │
│  │  • Compliance Worker                │ │
│  │  • Cleanup Worker                   │ │
│  │  • Monitoring Worker                │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │       Shared Services               │ │
│  │  • MetabaseService                  │ │
│  │  • DatabaseService                  │ │
│  │  • CacheService                     │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### **Implementation Method: Node.js Worker Threads + Cron**
- **No Bull Queue**: Keep it simple with native Node.js
- **Worker Threads**: For CPU-intensive author scoring
- **Cron Jobs**: Built-in scheduling with `node-cron`
- **Shared Memory**: Redis for worker coordination

---

## 📊 **Database Schema Extensions**

### **1. News Pipeline Tables**
```sql
-- News author relevance tracking
CREATE TABLE news_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  organization TEXT,
  domain TEXT, -- Company domain for matching
  relevance_score FLOAT NOT NULL DEFAULT 0.0,
  article_count INTEGER NOT NULL DEFAULT 0,
  recent_activity_score FLOAT NOT NULL DEFAULT 0.0,
  topics JSONB NOT NULL DEFAULT '[]', -- Areas of expertise
  locations JSONB NOT NULL DEFAULT '[]', -- Geographic coverage
  last_article_date TIMESTAMP WITH TIME ZONE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- News pipeline processing logs
CREATE TABLE news_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL, -- 'daily_sync', 'author_scoring', 'cleanup'
  status TEXT NOT NULL, -- 'running', 'completed', 'failed'
  articles_processed INTEGER DEFAULT 0,
  authors_updated INTEGER DEFAULT 0,
  records_cleaned INTEGER DEFAULT 0,
  execution_time INTEGER, -- milliseconds
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Production monitoring events
CREATE TABLE monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'alert', 'error', 'performance', 'compliance'
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  source TEXT NOT NULL, -- 'news_pipeline', 'compliance', 'api', 'database'
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Performance indexes
CREATE INDEX idx_authors_relevance ON news_authors(relevance_score DESC, updated_at DESC);
CREATE INDEX idx_authors_activity ON news_authors(recent_activity_score DESC, last_article_date DESC);
CREATE INDEX idx_pipeline_runs_status ON news_pipeline_runs(status, run_type, started_at DESC);
CREATE INDEX idx_monitoring_events_unresolved ON monitoring_events(resolved, severity, created_at DESC) WHERE resolved = false;
```

---

## ⚙️ **Implementation Components**

### **1. News Pipeline Worker (`src/workers/newsPipeline.worker.ts`)**
```typescript
import { Worker, isMainThread, parentPort } from 'worker_threads';
import cron from 'node-cron';

export class NewsPipelineWorker {
  private metabaseService: MetabaseService;
  private authorService: AuthorScoringService;
  private dbService: NewsPipelineDBService;

  constructor() {
    this.metabaseService = new MetabaseService();
    this.authorService = new AuthorScoringService();
    this.dbService = new NewsPipelineDBService();
  }

  async initialize() {
    // Schedule news pipeline jobs
    
    // Every 4 hours - Fetch new articles
    cron.schedule('0 */4 * * *', () => {
      this.runNewsPipeline();
    });

    // Daily at 3 AM - Update author relevance scores
    cron.schedule('0 3 * * *', () => {
      this.updateAuthorScores();
    });

    // Weekly cleanup - Sunday at 1 AM
    cron.schedule('0 1 * * 0', () => {
      this.runDatabaseCleanup();
    });

    logger.info('News pipeline worker initialized with cron jobs');
  }

  async runNewsPipeline(): Promise<void> {
    const runId = await this.dbService.startPipelineRun('daily_sync');
    
    try {
      // 1. Fetch new articles from Metabase
      const articles = await this.metabaseService.getArticles({
        limit: 200,
        sequenceId: await this.getLastSequenceId()
      });

      // 2. Filter articles (US location, relevant topics)
      const filteredArticles = this.filterArticlesByLocation(articles.articles);
      const relevantArticles = this.filterArticlesByTopics(filteredArticles);

      // 3. Extract and process authors
      const processedAuthors = await this.processAuthorsFromArticles(relevantArticles);

      // 4. Update database
      await this.dbService.updatePipelineRun(runId, {
        status: 'completed',
        articlesProcessed: relevantArticles.length,
        authorsUpdated: processedAuthors.length
      });

      logger.info('News pipeline completed successfully', {
        runId,
        articlesProcessed: relevantArticles.length,
        authorsUpdated: processedAuthors.length
      });

    } catch (error) {
      await this.dbService.updatePipelineRun(runId, {
        status: 'failed',
        errorMessage: error.message
      });
      
      // Create monitoring alert
      await this.createMonitoringAlert('high', 'News pipeline failed', error);
      throw error;
    }
  }

  private filterArticlesByLocation(articles: Article[]): Article[] {
    return articles.filter(article => {
      const locations = article.metadata?.locations || [];
      return locations.some(loc => 
        loc.country?.name === 'United States' || 
        loc.region === 'North America' ||
        article.source?.toLowerCase().includes('us') ||
        article.source?.toLowerCase().includes('american')
      );
    });
  }

  private filterArticlesByTopics(articles: Article[]): Article[] {
    const relevantTopics = [
      'technology', 'business', 'finance', 'healthcare', 
      'energy', 'automotive', 'telecommunications', 'media',
      'real estate', 'manufacturing', 'retail', 'aerospace'
    ];

    return articles.filter(article => {
      const topics = article.topics || [];
      return topics.some(topic => 
        relevantTopics.some(relevant => 
          topic.toLowerCase().includes(relevant.toLowerCase())
        )
      );
    });
  }
}
```

### **2. Author Scoring Service (`src/services/authorScoring.service.ts`)**
```typescript
export class AuthorScoringService {
  private dbService: NewsPipelineDBService;

  constructor() {
    this.dbService = new NewsPipelineDBService();
  }

  async updateAuthorScores(): Promise<void> {
    const authors = await this.dbService.getAllAuthors();
    
    for (const author of authors) {
      const score = await this.calculateRelevanceScore(author);
      await this.dbService.updateAuthorScore(author.id, score);
    }
  }

  private async calculateRelevanceScore(author: Author): Promise<AuthorScore> {
    // Get author's recent articles (last 30 days)
    const recentArticles = await this.dbService.getAuthorRecentArticles(author.name, 30);
    
    // Scoring algorithm
    const score = {
      // Base activity score (0-100)
      activityScore: Math.min(recentArticles.length * 5, 100),
      
      // Recency bonus (0-50) - articles in last 7 days get bonus
      recencyBonus: recentArticles.filter(a => 
        this.isWithinDays(a.publishedAt, 7)
      ).length * 10,
      
      // Topic relevance (0-50) - articles in high-value topics
      topicRelevance: this.calculateTopicRelevance(recentArticles),
      
      // Source authority (0-30) - premium sources get bonus
      sourceAuthority: this.calculateSourceAuthority(recentArticles),
      
      // Geographic relevance (0-20) - US-focused content
      geoRelevance: this.calculateGeoRelevance(recentArticles)
    };

    const totalScore = Math.min(
      score.activityScore + 
      score.recencyBonus + 
      score.topicRelevance + 
      score.sourceAuthority + 
      score.geoRelevance, 
      200
    );

    return {
      relevanceScore: totalScore,
      recentActivityScore: score.activityScore + score.recencyBonus,
      metadata: score
    };
  }

  async getTopAuthorsByRelevance(limit = 50): Promise<Author[]> {
    return this.dbService.getTopAuthorsByScore(limit);
  }

  async searchAuthorsByTopic(topic: string, limit = 20): Promise<Author[]> {
    return this.dbService.searchAuthorsByTopic(topic, limit);
  }
}
```

### **3. Database Cleanup Service (`src/services/databaseCleanup.service.ts`)**
```typescript
export class DatabaseCleanupService {
  private dbService: NewsPipelineDBService;

  async runCleanup(): Promise<CleanupResult> {
    const result = {
      oldArticlesRemoved: 0,
      oldLogsRemoved: 0,
      oldCacheCleared: 0,
      oldComplianceRecordsArchived: 0
    };

    // 1. Remove articles older than 90 days (keep compliance-critical ones)
    result.oldArticlesRemoved = await this.cleanupOldArticles();
    
    // 2. Remove old API logs (keep 30 days)
    result.oldLogsRemoved = await this.cleanupOldLogs();
    
    // 3. Clear old cache entries
    result.oldCacheCleared = await this.cleanupOldCache();
    
    // 4. Archive old compliance records (keep 2 years, archive older)
    result.oldComplianceRecordsArchived = await this.archiveOldCompliance();

    return result;
  }

  private async cleanupOldArticles(): Promise<number> {
    // Keep articles that are:
    // - Less than 90 days old
    // - Have compliance significance (licensed)
    // - Are revoked (legal requirement to keep)
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    return this.dbService.deleteOldArticles(cutoffDate, {
      keepRevoked: true,
      keepLicensed: true,
      keepHighValue: true
    });
  }
}
```

---

## 🔌 **Workflow Engine Integration**

### **4. News API Endpoints (`src/routes/news.routes.ts`)**
```typescript
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
 *       - in: query
 *         name: topic
 *         schema:
 *           type: string
 *         description: Filter by topic area
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [7days, 30days, 90days]
 *           default: 30days
 */
router.get('/authors/top', async (req: Request, res: Response) => {
  try {
    const { limit = 20, topic, timeframe = '30days' } = req.query;
    
    let authors;
    if (topic) {
      authors = await authorScoringService.searchAuthorsByTopic(topic as string, Number(limit));
    } else {
      authors = await authorScoringService.getTopAuthorsByRelevance(Number(limit));
    }

    // Format for workflow engine consumption
    const formattedAuthors = authors.map(author => ({
      id: author.id,
      name: author.name,
      email: author.email,
      organization: author.organization,
      relevanceScore: author.relevanceScore,
      recentActivityScore: author.recentActivityScore,
      topics: author.topics,
      lastArticleDate: author.lastArticleDate,
      articleCount: author.articleCount
    }));

    res.json({
      status: 'success',
      data: {
        authors: formattedAuthors,
        total: formattedAuthors.length,
        query: { limit, topic, timeframe },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching top authors', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch authors',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/v1/news/pipeline/status:
 *   get:
 *     summary: Get news pipeline health status
 */
router.get('/pipeline/status', async (req: Request, res: Response) => {
  try {
    const status = await newsPipelineService.getHealthStatus();
    
    res.json({
      status: 'success',
      data: {
        pipelineHealth: status.health,
        lastRun: status.lastRun,
        nextScheduledRun: status.nextRun,
        articlesInPipeline: status.articleCount,
        activeAuthors: status.authorCount,
        uptime: status.uptime,
        errors: status.recentErrors
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get pipeline status'
    });
  }
});
```

---

## 🚨 **Production Automation & Monitoring**

### **5. GCloud Scheduler Integration**
```yaml
# cloudbuild.yaml - Add scheduler deployment
steps:
  # ... existing build steps ...
  
  # Deploy Cloud Scheduler jobs
  - name: 'gcr.io/cloud-builders/gcloud'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        # Daily compliance job
        gcloud scheduler jobs create http daily-compliance-check \
          --schedule="0 2 * * *" \
          --uri="https://your-app.com/api/v1/internal/compliance/daily-check" \
          --http-method=POST \
          --headers="Authorization=Bearer ${_INTERNAL_API_KEY}" \
          --time-zone="America/New_York" \
          --attempt-deadline=600s \
          --max-retry-attempts=3 \
          --description="Daily Metabase compliance check"
        
        # Database health check
        gcloud scheduler jobs create http database-health-check \
          --schedule="*/30 * * * *" \
          --uri="https://your-app.com/api/v1/internal/health/database" \
          --http-method=GET \
          --headers="Authorization=Bearer ${_INTERNAL_API_KEY}" \
          --time-zone="America/New_York" \
          --description="Database and pipeline health monitoring"
```

### **6. Monitoring & Alerting Service (`src/services/monitoring.service.ts`)**
```typescript
export class MonitoringService {
  private emailService: EmailService;
  private slackService: SlackService;
  
  async initializeMonitoring() {
    // Start monitoring loops
    
    // Check system health every 5 minutes
    setInterval(() => {
      this.checkSystemHealth();
    }, 5 * 60 * 1000);

    // Check compliance SLA every hour
    setInterval(() => {
      this.checkComplianceSLA();
    }, 60 * 60 * 1000);

    // Check pipeline health every 30 minutes
    setInterval(() => {
      this.checkPipelineHealth();
    }, 30 * 60 * 1000);
  }

  private async checkComplianceSLA(): Promise<void> {
    const lastComplianceCheck = await this.dbService.getLastComplianceCheck();
    const hoursSinceLastCheck = this.getHoursSince(lastComplianceCheck.checkDate);

    if (hoursSinceLastCheck > 25) {
      await this.createAlert('critical', 'Compliance SLA Violation', {
        message: `Compliance check overdue by ${hoursSinceLastCheck - 24} hours`,
        lastCheck: lastComplianceCheck.checkDate,
        severity: 'CRITICAL - REGULATORY VIOLATION RISK'
      });
    }
  }

  private async createAlert(severity: string, title: string, details: any): Promise<void> {
    // Store in database
    await this.dbService.createMonitoringEvent({
      eventType: 'alert',
      severity,
      source: 'monitoring_service',
      message: title,
      details
    });

    // Send notifications based on severity
    if (severity === 'critical') {
      await this.emailService.sendAlert(title, details);
      await this.slackService.sendAlert(title, details);
    } else if (severity === 'high') {
      await this.slackService.sendAlert(title, details);
    }
  }
}
```

### **7. Health Check Endpoints (`src/routes/health.routes.ts`)**
```typescript
/**
 * @swagger
 * /api/v1/health/comprehensive:
 *   get:
 *     summary: Comprehensive system health check for monitoring
 */
router.get('/comprehensive', async (req: Request, res: Response) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'unknown',
      redis: 'unknown',
      metabase: 'unknown',
      newsPipeline: 'unknown',
      compliance: 'unknown'
    },
    metrics: {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      activeConnections: 0,
      pipelineStatus: {},
      complianceStatus: {}
    },
    alerts: []
  };

  try {
    // Check database
    const dbHealth = await checkDatabaseHealth();
    healthCheck.services.database = dbHealth.status;
    
    // Check Redis
    const redisHealth = await checkRedisHealth();
    healthCheck.services.redis = redisHealth.status;
    
    // Check news pipeline
    const pipelineHealth = await checkNewsPipelineHealth();
    healthCheck.services.newsPipeline = pipelineHealth.status;
    healthCheck.metrics.pipelineStatus = pipelineHealth.metrics;
    
    // Check compliance status
    const complianceHealth = await checkComplianceHealth();
    healthCheck.services.compliance = complianceHealth.status;
    healthCheck.metrics.complianceStatus = complianceHealth.metrics;
    
    // Get recent unresolved alerts
    healthCheck.alerts = await getUnresolvedAlerts(10);

    // Determine overall status
    const serviceStatuses = Object.values(healthCheck.services);
    if (serviceStatuses.includes('critical')) {
      healthCheck.status = 'critical';
    } else if (serviceStatuses.includes('degraded')) {
      healthCheck.status = 'degraded';
    }

    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 202 : 503;

    res.status(statusCode).json(healthCheck);

  } catch (error) {
    healthCheck.status = 'critical';
    healthCheck.alerts.push({
      severity: 'critical',
      message: 'Health check failed',
      error: error.message
    });
    
    res.status(503).json(healthCheck);
  }
});
```

---

## 📋 **Implementation Timeline**

### **Week 1: Foundation & Background Processing**
- [ ] **Day 1-2**: Set up background worker architecture
  - Install `node-cron` dependency
  - Create worker thread infrastructure
  - Implement basic pipeline worker

- [ ] **Day 3-4**: Database schema & services
  - Create news pipeline tables
  - Implement NewsPipelineDBService
  - Create basic author scoring algorithm

- [ ] **Day 5-7**: Core news pipeline
  - Implement article filtering logic
  - Create author extraction and scoring
  - Test background processing loop

### **Week 2: Workflow Integration & API Endpoints**
- [ ] **Day 1-3**: API endpoints for workflow engine
  - Create news routes (`/api/v1/news/`)
  - Implement author search endpoints
  - Add pagination and filtering

- [ ] **Day 4-5**: Database cleanup service
  - Implement cleanup algorithms
  - Add size management policies
  - Create maintenance jobs

- [ ] **Day 6-7**: Testing & validation
  - Test workflow engine integration
  - Validate author scoring accuracy
  - Performance testing

### **Week 3: Production Automation & Monitoring**
- [ ] **Day 1-3**: GCloud Scheduler integration
  - Set up compliance scheduler jobs
  - Create internal API endpoints
  - Configure authentication

- [ ] **Day 4-5**: Monitoring & alerting system
  - Implement monitoring service
  - Set up email/Slack notifications
  - Create health check endpoints

- [ ] **Day 6-7**: Production deployment
  - Deploy monitoring infrastructure
  - Configure production alerts
  - Final testing and validation

---

## 🚀 **Production Configuration**

### **Environment Variables**
```env
# News Pipeline Configuration
NEWS_PIPELINE_ENABLED=true
NEWS_PIPELINE_SCHEDULE_HOURS=4
NEWS_AUTHOR_SCORING_ENABLED=true
NEWS_CLEANUP_ENABLED=true

# Monitoring Configuration
MONITORING_ENABLED=true
COMPLIANCE_SLA_HOURS=24
ALERT_EMAIL=ops@yourcompany.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/...

# GCloud Scheduler
INTERNAL_API_KEY=your-secure-internal-key
SCHEDULER_TIME_ZONE=America/New_York
```

### **Swagger Documentation Update**
All new endpoints will be automatically documented in your existing Swagger setup at `/api-docs`.

### **Package.json Updates**
```json
{
  "dependencies": {
    // Add these dependencies
    "node-cron": "^3.0.3",
    "nodemailer": "^6.9.7",
    "@slack/webhook": "^7.0.2"
  }
}
```

---

## 📊 **Success Metrics & KPIs**

### **Pipeline Performance**
- **Article Processing Rate**: >200 articles per sync
- **Author Discovery Rate**: >10 new relevant authors per day
- **Pipeline Uptime**: >99.5%
- **Processing Time**: <5 minutes per sync

### **Data Quality**
- **Author Relevance Accuracy**: >80% of top authors should be genuinely relevant
- **Geographic Filtering**: >95% of articles should be US-relevant
- **Topic Relevance**: >90% of articles should match target topics

### **System Health**
- **Database Growth Rate**: <10GB per month
- **Compliance SLA**: <24 hours between checks
- **Alert Response Time**: <5 minutes for critical alerts
- **System Availability**: >99.9% uptime

---

## 🎯 **Next Steps**

1. **Review & Approve Plan**: Confirm this architecture meets your requirements
2. **Install Dependencies**: Add `node-cron`, `nodemailer`, `@slack/webhook`
3. **Create Database Schema**: Run migrations for new tables
4. **Start Week 1 Implementation**: Begin with background worker foundation
5. **Set Up Monitoring**: Configure email/Slack for alerts

**Ready to start implementation? This plan gives you a production-ready news pipeline with automated compliance and monitoring - all within your existing Node.js application architecture.** 