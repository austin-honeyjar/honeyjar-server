import { Router } from 'express';
import { db } from '../db/index.js';
import { csvMetadata } from '../db/schema.js';
import os from 'os';
import logger from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Basic health check
 *     description: Returns basic health information about the API
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * @openapi
 * /health/database:
 *   get:
 *     tags:
 *       - Health
 *     summary: Database health check
 *     description: Checks if the database connection is working
 *     responses:
 *       200:
 *         description: Database is connected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 database:
 *                   type: string
 *                   example: connected
 *       503:
 *         description: Database connection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/database', async (req, res) => {
  try {
    await db.select().from(csvMetadata).limit(1);
    res.json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error: unknown) {
    logger.error('Database health check failed', { error });
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: process.env.NODE_ENV === 'devlocal' ? (error as Error).message : 'Database connection failed',
    });
  }
});

/**
 * @openapi
 * /health/resources:
 *   get:
 *     tags:
 *       - Health
 *     summary: System resources check
 *     description: Returns information about system resources (CPU, memory)
 *     responses:
 *       200:
 *         description: Resource information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 memory:
 *                   type: object
 *                   properties:
 *                     heapUsed:
 *                       type: number
 *                       description: Memory used by the V8 heap
 *                     heapTotal:
 *                       type: number
 *                       description: Total available heap memory
 *                     rss:
 *                       type: number
 *                       description: Resident Set Size (total memory allocated)
 *                 cpu:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                       description: Number of CPU cores
 *                     model:
 *                       type: string
 *                       description: CPU model name
 *                     speed:
 *                       type: number
 *                       description: CPU speed in MHz
 *                 uptime:
 *                   type: number
 *                   description: System uptime in seconds
 */
router.get('/resources', (req, res) => {
  const memory = process.memoryUsage();
  const cpus = os.cpus();
  
  res.json({
    status: 'ok',
    memory: {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss,
    },
    cpu: {
      count: cpus.length,
      model: cpus[0].model,
      speed: cpus[0].speed,
    },
    uptime: os.uptime(),
  });
});

/**
 * @openapi
 * /health/full:
 *   get:
 *     tags:
 *       - Health
 *     summary: Full health check
 *     description: Performs a comprehensive health check of all system components
 *     responses:
 *       200:
 *         description: All systems are healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 database:
 *                   type: string
 *                   example: connected
 *                 resources:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                       properties:
 *                         heapUsed:
 *                           type: number
 *                         heapTotal:
 *                           type: number
 *                         rss:
 *                           type: number
 *                     cpu:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: number
 *                         load:
 *                           type: array
 *                           items:
 *                             type: number
 *       503:
 *         description: One or more systems are unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/full', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'unknown',
    resources: {
      memory: process.memoryUsage(),
      cpu: {
        count: os.cpus().length,
        load: os.loadavg(),
      },
    },
  };

  try {
    await db.select().from(csvMetadata).limit(1);
    checks.database = 'connected';
  } catch (error: unknown) {
    checks.status = 'error';
    checks.database = 'disconnected';
    logger.error('Full health check failed', { error });
  }

  res.status(checks.status === 'ok' ? 200 : 503).json(checks);
});

export default router; 