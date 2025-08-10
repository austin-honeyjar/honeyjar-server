import Bull from 'bull';
import IORedis from 'ioredis';
import logger from '../utils/logger';

// Redis connection for all queues (using existing Redis, different DB)
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 1, // Use DB 1 for queues (assuming cache uses DB 0)
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  // Remove problematic settings that prevent Bull from working
  // enableReadyCheck: false,  // This prevents proper connection
  // lazyConnect: true,        // This prevents immediate connection
};

export const redis = new IORedis(redisConfig);

// Log Redis connection events
redis.on('connect', () => logger.info('✅ Connected to Redis for Bull Queues (DB 1)'));
redis.on('error', (err) => logger.error('❌ Redis queue connection error:', err));
redis.on('ready', () => logger.info('🎯 Redis queue connection ready'));

export const queues = {
  // TIER 1: Critical User-Facing Operations
  intent: new Bull('intent-classification', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
    }
  }),

  openai: new Bull('openai-processing', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  }),

  rag: new Bull('rag-processing', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 25,
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
    }
  }),

  // TIER 2: Important Background Operations
  security: new Bull('security-classification', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 25,
      attempts: 2,
      backoff: { type: 'exponential', delay: 1500 },
    }
  }),

  metabase: new Bull('metabase-queries', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 25,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
    }
  }),

  // TIER 3: Lower Priority Operations
  rocketreach: new Bull('rocketreach-api', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 25,
      removeOnFail: 15,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    }
  }),

  fileProcessing: new Bull('file-processing', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 25,
      removeOnFail: 15,
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
    }
  }),

  userKnowledge: new Bull('user-knowledge', { 
    redis: redisConfig,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 25,
      attempts: 1,
      backoff: { type: 'exponential', delay: 500 },
    }
  }),
};

// Concurrency limits to prevent overwhelming systems
export const concurrencyLimits = {
  intent: 10,       // 10 concurrent intent classifications
  openai: 5,        // 5 concurrent OpenAI calls
  rag: 8,           // 8 concurrent RAG searches
  security: 10,     // 10 concurrent security analyses
  metabase: 3,      // 3 concurrent Metabase queries
  rocketreach: 2,   // 2 concurrent RocketReach calls (API limits)
  fileProcessing: 5, // 5 concurrent file operations
  userKnowledge: 10, // 10 concurrent knowledge retrievals
};

// Job type definitions
export interface IntentJobData {
  userMessage: string;
  conversationHistory: any[];
  currentWorkflow: any;
  userId: string;
  threadId: string;
  orgId: string;
}

export interface OpenAIJobData {
  message: string;
  context?: string;
  model?: string;
  userId: string;
  jobType: 'chat-completion' | 'generate-embedding';
  maxTokens?: number;
  temperature?: number;
}

export interface SecurityJobData {
  content: string;
  userId: string;
  orgId: string;
  context?: any;
}

export interface RAGJobData {
  query: string;
  userId: string;
  orgId: string;
  limit?: number;
  threshold?: number;
  securityLevel?: string;
}

export interface RocketReachJobData {
  contacts?: any[];
  name?: string;
  organization?: string;
  email?: string;
  workflowType?: string;
  userId: string;
  orgId: string;
  jobType: 'contact-enrichment' | 'person-lookup';
}

export interface MetabaseJobData {
  dashboardId?: string;
  cardId?: string;
  parameters?: any;
  userId: string;
}

// Queue monitoring and health
export const monitorQueues = async () => {
  try {
    const queueStats = {};
    
    for (const [name, queue] of Object.entries(queues)) {
      const counts = await queue.getJobCounts();
      queueStats[name] = counts;
    }

    logger.info('📊 Queue Status Report:', queueStats);
    return queueStats;
  } catch (error) {
    logger.error('❌ Failed to monitor queues:', error);
    return {};
  }
};

// Graceful shutdown
export const shutdownQueues = async () => {
  logger.info('🔄 Shutting down all queues...');

  try {
    const shutdownPromises = Object.entries(queues).map(async ([name, queue]) => {
      await queue.close();
      logger.info(`✅ Queue ${name} closed`);
    });

    await Promise.all(shutdownPromises);
    await redis.quit();
    logger.info('✅ All queues closed and Redis connection terminated');
  } catch (error) {
    logger.error('❌ Error during queue shutdown:', error);
    throw error;
  }
};

// Queue event listeners for monitoring
export const setupQueueMonitoring = () => {
  Object.entries(queues).forEach(([name, queue]) => {
    // Success events
    queue.on('completed', (job) => {
      logger.info(`✅ Job completed in ${name}`, {
        jobId: job.id,
        duration: Date.now() - job.timestamp,
        attempts: job.attemptsMade,
      });
    });

    // Failure events
    queue.on('failed', (job, error) => {
      logger.error(`❌ Job failed in ${name}`, {
        jobId: job.id,
        error: error.message,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      });
    });

    // Progress events
    queue.on('progress', (job, progress) => {
      logger.debug(`🔄 Job progress in ${name}`, {
        jobId: job.id,
        progress: `${progress}%`,
      });
    });

    // Stalled events
    queue.on('stalled', (jobId) => {
      logger.warn(`⚠️ Job stalled in ${name}`, { jobId });
    });

    // Active events
    queue.on('active', (job) => {
      logger.debug(`🟡 Job active in ${name}`, {
        jobId: job.id,
        name: job.name,
      });
    });

    // Waiting events
    queue.on('waiting', (jobId) => {
      logger.debug(`⏳ Job waiting in ${name}`, { jobId });
    });
  });

  logger.info('📡 Queue monitoring enabled for all queues');
};

// Utility function to find job across all queues
export const findJobAcrossQueues = async (jobId: string) => {
  for (const [queueName, queue] of Object.entries(queues)) {
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        return { job, queueName };
      }
    } catch (error) {
      // Continue searching other queues
      logger.debug(`Job ${jobId} not found in queue ${queueName}`);
    }
  }
  return null;
};

// Queue health check
export const checkQueueHealth = async () => {
  const health = {
    redis: false,
    queues: {},
    totalJobs: {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
    },
  };

  try {
    // Check Redis connection
    await redis.ping();
    health.redis = true;

    // Check each queue
    for (const [name, queue] of Object.entries(queues)) {
      try {
        const counts = await queue.getJobCounts();
        health.queues[name] = {
          status: 'healthy',
          counts,
        };

        // Aggregate totals
        health.totalJobs.waiting += counts.waiting || 0;
        health.totalJobs.active += counts.active || 0;
        health.totalJobs.completed += counts.completed || 0;
        health.totalJobs.failed += counts.failed || 0;
      } catch (error) {
        health.queues[name] = {
          status: 'unhealthy',
          error: error.message,
        };
      }
    }
  } catch (error) {
    logger.error('❌ Queue health check failed:', error);
  }

  return health;
};

// Initialize queues
export const initializeQueues = async () => {
  try {
    logger.info('🚀 Initializing comprehensive queue system...');
    
    // Test Redis connection
    await redis.ping();
    logger.info('✅ Redis connection verified');

    // Setup monitoring
    setupQueueMonitoring();

    // Log queue configuration
    logger.info('📋 Queue Configuration:', {
      totalQueues: Object.keys(queues).length,
      concurrencyLimits,
      redisConfig: {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db,
      },
    });

    logger.info('🎯 Comprehensive queue system initialized successfully');
    return true;
  } catch (error) {
    logger.error('❌ Failed to initialize queue system:', error);
    throw error;
  }
};
