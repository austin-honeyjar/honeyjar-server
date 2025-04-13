import { Router } from 'express';
import { db } from '../db/index.js';
import { csvMetadata } from '../db/schema.js';
import os from 'os';
import logger from '../utils/logger.js';

const router = Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Database health check
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

// System resources check
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

// Full health check (all checks combined)
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