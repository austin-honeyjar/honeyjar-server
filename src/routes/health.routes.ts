import { Router, Request, Response } from 'express';
import { db } from '../db/index';
import { csvMetadata } from '../db/schema';
import os from 'os';
import logger from '../utils/logger';
import express from 'express';
import { config } from '../config';
import { authMiddleware } from '../middleware/auth.middleware';
import { MetabaseService } from '../services/metabase.service';
import { cacheService } from '../services/cache.service';
import axios from 'axios';

const router = Router();

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  responseTime?: number;
  details?: any;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    [key: string]: HealthCheck;
  };
  metrics?: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    requests: {
      total: number;
      successful: number;
      failed: number;
      averageResponseTime: number;
    };
  };
}

// Global metrics tracking
let requestMetrics = {
  total: 0,
  successful: 0,
  failed: 0,
  responseTimes: [] as number[]
};

// Middleware to track request metrics
export function trackRequestMetrics(req: Request, res: Response, next: any) {
  const startTime = Date.now();
  
  requestMetrics.total++;
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    requestMetrics.responseTimes.push(responseTime);
    
    // Keep only last 1000 response times for memory efficiency
    if (requestMetrics.responseTimes.length > 1000) {
      requestMetrics.responseTimes = requestMetrics.responseTimes.slice(-1000);
    }
    
    if (res.statusCode >= 200 && res.statusCode < 400) {
      requestMetrics.successful++;
    } else {
      requestMetrics.failed++;
    }
  });
  
  next();
}

/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Basic health check
 *     description: Simple health status endpoint for load balancers
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/', async (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * @openapi
 * /health/detailed:
 *   get:
 *     tags:
 *       - Health
 *     summary: Detailed health check
 *     description: Comprehensive health status with dependency checks and metrics
 *     responses:
 *       200:
 *         description: Detailed health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy, degraded]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Uptime in seconds
 *                 version:
 *                   type: string
 *                 environment:
 *                   type: string
 *                 checks:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                         enum: [healthy, unhealthy, degraded]
 *                       responseTime:
 *                         type: number
 *                       details:
 *                         type: object
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  try {
    logger.info('🏥 Running detailed health checks');
    
    // Run all health checks in parallel
    const [
      metabaseCheck,
      memoryCheck,
      envCheck,
      cacheCheck
    ] = await Promise.allSettled([
      checkMetabaseAPI(),
      checkMemoryUsage(),
      checkEnvironmentVariables(),
      checkCacheHealth()
    ]);

    const checks: { [key: string]: HealthCheck } = {
      metabase: getSettledResult(metabaseCheck),
      memory: getSettledResult(memoryCheck),
      environment: getSettledResult(envCheck),
      cache: getSettledResult(cacheCheck)
    };

    // Determine overall status
    const statuses = Object.values(checks).map(check => check.status);
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    // Calculate metrics
    const metrics = calculateMetrics();

    const response: HealthResponse = {
      status: overallStatus,
      timestamp,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      metrics
    };

    const responseTime = Date.now() - startTime;
    logger.info('✅ Health check completed', {
      status: overallStatus,
      responseTime,
      checksCount: Object.keys(checks).length
    });

    if (overallStatus === 'unhealthy') {
      return res.status(503).json(response);
    } else if (overallStatus === 'degraded') {
      return res.status(200).json(response);
    }

    res.json(response);
  } catch (error) {
    logger.error('💥 Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp,
      error: 'Health check system failure',
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

/**
 * @openapi
 * /health/metabase:
 *   get:
 *     tags:
 *       - Health
 *     summary: Metabase API health check
 *     description: Check connectivity and response time to Metabase API
 */
router.get('/metabase', async (req: Request, res: Response) => {
  try {
    const result = await checkMetabaseAPI();
    
    if (result.status === 'healthy') {
      res.json(result);
    } else {
      res.status(503).json(result);
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /health/metrics:
 *   get:
 *     tags:
 *       - Health
 *     summary: Application metrics
 *     description: Get current application performance metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const metrics = calculateMetrics();
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    data: metrics
  });
});

/**
 * @openapi
 * /health/cache:
 *   get:
 *     tags:
 *       - Health
 *     summary: Cache health check
 *     description: Check Redis cache connectivity and performance
 */
router.get('/cache', async (req: Request, res: Response) => {
  try {
    const result = await checkCacheHealth();
    
    if (result.status === 'healthy') {
      res.json(result);
    } else {
      res.status(503).json(result);
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check functions
async function checkMetabaseAPI(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    const baseURL = process.env.METABASE_BASE_URL || 'http://metabase.moreover.com';
    const apiKey = process.env.METABASE_API_KEY;
    
    if (!apiKey) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Missing METABASE_API_KEY environment variable'
      };
    }

    // Simple health check - try to get a minimal response
    const response = await axios.get(`${baseURL}/api/v10/articles`, {
      params: {
        key: apiKey,
        limit: 1
      },
      timeout: 5000 // 5 second timeout
    });

    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime,
      details: {
        statusCode: response.status,
        contentType: response.headers['content-type']
      }
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    let status: 'unhealthy' | 'degraded' = 'unhealthy';
    
    // If it's a timeout or network error, consider it unhealthy
    // If it's a 4xx error, might be degraded (API is responding but with errors)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      status = 'degraded';
    }
    
    return {
      status,
      timestamp: new Date().toISOString(),
      responseTime,
      error: error.message,
      details: {
        statusCode: error.response?.status,
        errorCode: error.code
      }
    };
  }
}

async function checkMemoryUsage(): Promise<HealthCheck> {
  const memUsage = process.memoryUsage();
  const totalMem = memUsage.heapTotal;
  const usedMem = memUsage.heapUsed;
  const percentage = (usedMem / totalMem) * 100;
  
  let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
  
  if (percentage > 90) {
    status = 'unhealthy';
  } else if (percentage > 75) {
    status = 'degraded';
  }
  
  return {
    status,
    timestamp: new Date().toISOString(),
    details: {
      heapUsed: Math.round(usedMem / 1024 / 1024), // MB
      heapTotal: Math.round(totalMem / 1024 / 1024), // MB
      percentage: Math.round(percentage),
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024) // MB
    }
  };
}

async function checkEnvironmentVariables(): Promise<HealthCheck> {
  const requiredEnvVars = [
    'METABASE_API_KEY',
    'METABASE_BASE_URL',
    'NODE_ENV'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: `Missing required environment variables: ${missingVars.join(', ')}`,
      details: {
        required: requiredEnvVars,
        missing: missingVars
      }
    };
  }
  
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    details: {
      environment: process.env.NODE_ENV,
      hasApiKey: !!process.env.METABASE_API_KEY,
      hasBaseUrl: !!process.env.METABASE_BASE_URL
    }
  };
}

async function checkCacheHealth(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    const healthResult = await cacheService.healthCheck();
    const responseTime = Date.now() - startTime;
    
    return {
      status: healthResult.status === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      details: healthResult.details
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      error: error.message,
      details: {
        message: 'Cache health check failed'
      }
    };
  }
}

function getSettledResult(settledResult: PromiseSettledResult<HealthCheck>): HealthCheck {
  if (settledResult.status === 'fulfilled') {
    return settledResult.value;
  } else {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: settledResult.reason?.message || 'Health check failed'
    };
  }
}

function calculateMetrics() {
  const memUsage = process.memoryUsage();
  const averageResponseTime = requestMetrics.responseTimes.length > 0
    ? requestMetrics.responseTimes.reduce((sum, time) => sum + time, 0) / requestMetrics.responseTimes.length
    : 0;

  return {
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    },
    cpu: {
      usage: Math.round(process.cpuUsage().user / 1000) // Simplified CPU usage
    },
    requests: {
      total: requestMetrics.total,
      successful: requestMetrics.successful,
      failed: requestMetrics.failed,
      averageResponseTime: Math.round(averageResponseTime)
    },
    uptime: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development'
  };
}

const debugRouter = express.Router();

// Health check endpoint
debugRouter.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.server.env
  });
});

// Debug settings endpoint (protected)
debugRouter.put('/debug', authMiddleware, (req, res) => {
  try {
    const { enableDebugMode, showFullResponses } = req.body;
    
    // Update config with new settings
    if (typeof enableDebugMode === 'boolean') {
      (config.debug as any).enableDebugMode = enableDebugMode;
    }
    
    if (typeof showFullResponses === 'boolean') {
      (config.debug as any).showFullResponses = showFullResponses;
    }
    
    logger.info('Debug settings updated', { 
      enableDebugMode: config.debug.enableDebugMode,
      showFullResponses: config.debug.showFullResponses,
      updatedBy: req.user?.id || 'unknown'
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Debug settings updated',
      settings: config.debug
    });
  } catch (error) {
    logger.error('Error updating debug settings', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to update debug settings'
    });
  }
});

// Get current debug settings (protected)
debugRouter.get('/debug', authMiddleware, (req, res) => {
  res.status(200).json({
    status: 'success',
    settings: config.debug
  });
});

export default router; 