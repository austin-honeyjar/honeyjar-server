import { Request, Response } from 'express';
import { performanceMonitor } from '../services/performanceMonitor.service';
import { checkDatabaseHealth } from '../db';
import { redis } from '../services/comprehensiveQueues';
import logger from '../utils/logger';

export class HealthController {
  /**
   * Basic health check endpoint
   */
  static async basicHealth(req: Request, res: Response) {
    try {
      const healthChecks = await Promise.allSettled([
        checkDatabaseHealth(),
        HealthController.checkRedisHealth(),
        HealthController.checkSystemHealth(),
      ]);

      const results = healthChecks.map((result, index) => {
        if (result.status === 'fulfilled') {
          return { status: 'healthy', data: result.value };
        } else {
          return { status: 'unhealthy', error: result.reason?.message };
        }
      });

      const [dbHealth, redisHealth, systemHealth] = results;
      const overallHealth = results.every(r => r.status === 'healthy') ? 'healthy' : 'degraded';

      const response = {
        status: overallHealth,
        timestamp: new Date().toISOString(),
        checks: {
          database: dbHealth,
          redis: redisHealth,
          system: systemHealth,
        },
      };

      const statusCode = overallHealth === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);

    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Detailed health check with performance metrics
   */
  static async detailedHealth(req: Request, res: Response) {
    try {
      const metrics = performanceMonitor.getCurrentMetrics();
      const summary = performanceMonitor.getSystemHealthSummary();
      const alerts = performanceMonitor.getAlerts();

      const response = {
        status: summary?.status || 'unknown',
        timestamp: new Date().toISOString(),
        metrics,
        summary,
        alerts: alerts.filter(a => !a.acknowledged),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        },
      };

      res.json(response);

    } catch (error) {
      logger.error('Detailed health check failed:', error);
      res.status(500).json({
        status: 'error',
        error: 'Detailed health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Performance metrics endpoint
   */
  static async getMetrics(req: Request, res: Response) {
    try {
      const { limit = '100', timeRange = '1h' } = req.query;

      let metrics;
      if (timeRange === '1h') {
        metrics = performanceMonitor.getMetricsHistory(120); // 30s * 120 = 1 hour
      } else if (timeRange === '6h') {
        metrics = performanceMonitor.getMetricsHistory(720); // 30s * 720 = 6 hours
      } else if (timeRange === '24h') {
        metrics = performanceMonitor.getMetricsHistory(2880); // 30s * 2880 = 24 hours
      } else {
        metrics = performanceMonitor.getMetricsHistory(parseInt(limit as string));
      }

      res.json({
        metrics,
        count: metrics.length,
        timeRange,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to get metrics:', error);
      res.status(500).json({
        error: 'Failed to get metrics',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * System alerts endpoint
   */
  static async getAlerts(req: Request, res: Response) {
    try {
      const { acknowledged = 'false' } = req.query;
      const alerts = performanceMonitor.getAlerts(acknowledged === 'true');

      const filteredAlerts = acknowledged === 'true'
        ? alerts
        : alerts.filter(a => !a.acknowledged);

      res.json({
        alerts: filteredAlerts,
        count: filteredAlerts.length,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to get alerts:', error);
      res.status(500).json({
        error: 'Failed to get alerts',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Acknowledge an alert
   */
  static async acknowledgeAlert(req: Request, res: Response) {
    try {
      const { alertId } = req.params;

      const acknowledged = performanceMonitor.acknowledgeAlert(alertId);

      if (acknowledged) {
        res.json({
          message: 'Alert acknowledged successfully',
          alertId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          error: 'Alert not found',
          alertId,
          timestamp: new Date().toISOString(),
        });
      }

    } catch (error) {
      logger.error('Failed to acknowledge alert:', error);
      res.status(500).json({
        error: 'Failed to acknowledge alert',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * System performance summary
   */
  static async getPerformanceSummary(req: Request, res: Response) {
    try {
      const summary = performanceMonitor.getSystemHealthSummary();
      const currentMetrics = performanceMonitor.getCurrentMetrics();
      const alertCount = performanceMonitor.getAlerts().filter(a => !a.acknowledged).length;

      if (!summary || !currentMetrics) {
        return res.status(503).json({
          status: 'unavailable',
          message: 'Performance monitoring not available',
          timestamp: new Date().toISOString(),
        });
      }

      const response = {
        status: summary.status,
        metrics: {
          cpu: currentMetrics.system.cpu,
          memory: currentMetrics.system.memory.percentage,
          responseTime: currentMetrics.api.averageResponseTime,
          activeUsers: currentMetrics.api.activeUsers,
          queueDepth: currentMetrics.queues.totalJobs,
          errorRate: currentMetrics.api.errorRate,
        },
        alerts: {
          total: alertCount,
          hasAlerts: alertCount > 0,
        },
        uptime: currentMetrics.system.uptime,
        lastUpdated: currentMetrics.timestamp,
        timestamp: new Date().toISOString(),
      };

      res.json(response);

    } catch (error) {
      logger.error('Failed to get performance summary:', error);
      res.status(500).json({
        error: 'Failed to get performance summary',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Queue status endpoint
   */
  static async getQueueStatus(req: Request, res: Response) {
    try {
      const currentMetrics = performanceMonitor.getCurrentMetrics();
      
      if (!currentMetrics) {
        return res.status(503).json({
          status: 'unavailable',
          message: 'Queue metrics not available',
          timestamp: new Date().toISOString(),
        });
      }

      const queueMetrics = currentMetrics.queues;
      const workerMetrics = currentMetrics.workers;

      res.json({
        queues: {
          overview: {
            total: queueMetrics.totalJobs,
            waiting: queueMetrics.waiting,
            active: queueMetrics.active,
            completed: queueMetrics.completed,
            failed: queueMetrics.failed,
            delayed: queueMetrics.delayed,
            stalled: queueMetrics.stalled,
          },
          byQueue: queueMetrics.byQueue,
        },
        workers: workerMetrics,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to get queue status:', error);
      res.status(500).json({
        error: 'Failed to get queue status',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private static async checkRedisHealth(): Promise<any> {
    try {
      const startTime = Date.now();
      await redis.ping();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private static async checkSystemHealth(): Promise<any> {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      return {
        status: 'healthy',
        memory: {
          used: memUsage.heapUsed,
          total: require('os').totalmem(),
          free: require('os').freemem(),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
