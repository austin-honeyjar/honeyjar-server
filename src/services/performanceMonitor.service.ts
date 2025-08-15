import { EventEmitter } from 'events';
import { redis } from './comprehensiveQueues';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import logger from '../utils/logger';

export interface PerformanceMetrics {
  timestamp: number;
  system: {
    cpu: number;
    memory: {
      used: number;
      total: number;
      free: number;
      percentage: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
    uptime: number;
    loadAverage: number[];
  };
  database: {
    activeConnections: number;
    maxConnections: number;
    queryTime: number;
    slowQueries: number;
    connectionPoolUtilization: number;
  };
  queues: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    stalled: number;
    totalJobs: number;
    byQueue: Record<string, {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    }>;
  };
  api: {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    activeUsers: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  workers: {
    intentWorker: WorkerMetrics;
    openaiWorker: WorkerMetrics;
    securityWorker: WorkerMetrics;
    ragWorker: WorkerMetrics;
    rocketreachWorker: WorkerMetrics;
  };
  thirdParty: {
    openai: {
      callsPerMinute: number;
      successRate: number;
      averageResponseTime: number;
      rateLimitHits: number;
      tokensUsed: number;
    };
    rocketreach: {
      callsPerMinute: number;
      successRate: number;
      averageResponseTime: number;
      rateLimitHits: number;
      creditsUsed: number;
    };
  };
}

interface WorkerMetrics {
  jobsProcessed: number;
  averageProcessingTime: number;
  successRate: number;
  failureRate: number;
  activeJobs: number;
  queueDepth: number;
}

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
  resolved: boolean;
  category: 'system' | 'database' | 'queue' | 'api' | 'worker' | 'thirdparty';
}

export class PerformanceMonitorService extends EventEmitter {
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metricsHistory: PerformanceMetrics[] = [];
  private alerts: Alert[] = [];
  private responseTimes: number[] = [];
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();
  
  private alertThresholds = {
    cpu: { warning: 70, error: 85, critical: 95 },
    memory: { warning: 80, error: 90, critical: 95 },
    databaseConnections: { warning: 15, error: 18, critical: 20 },
    responseTime: { warning: 1000, error: 2000, critical: 5000 },
    errorRate: { warning: 5, error: 10, critical: 20 },
    queueSize: { warning: 100, error: 500, critical: 1000 },
    workerSuccessRate: { warning: 90, error: 80, critical: 70 },
    thirdPartySuccessRate: { warning: 95, error: 90, critical: 85 },
  };

  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Performance monitoring already active');
      return;
    }

    this.isMonitoring = true;
    logger.info('🚀 Starting comprehensive performance monitoring', {
      interval: `${intervalMs}ms`,
      thresholds: this.alertThresholds,
    });

    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, intervalMs);

    // Initial metrics collection
    await this.collectMetrics();
  }

  async stopMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Performance monitoring stopped');
  }

  private async collectMetrics(): Promise<void> {
    try {
      const startTime = Date.now();
      
      const metrics = await this.gatherAllMetrics();
      this.metricsHistory.push(metrics);

      // Keep only last 1000 metrics (about 8 hours at 30s intervals)
      if (this.metricsHistory.length > 1000) {
        this.metricsHistory = this.metricsHistory.slice(-1000);
      }

      this.checkAlerts(metrics);
      this.emit('metrics', metrics);

      const collectionTime = Date.now() - startTime;
      
      logger.debug('📊 Performance metrics collected', {
        timestamp: new Date(metrics.timestamp).toISOString(),
        cpu: `${metrics.system.cpu}%`,
        memory: `${metrics.system.memory.percentage}%`,
        activeConnections: metrics.database.activeConnections,
        queueDepth: metrics.queues.totalJobs,
        collectionTime: `${collectionTime}ms`,
      });
    } catch (error) {
      logger.error('❌ Failed to collect performance metrics:', error);
    }
  }

  private async gatherAllMetrics(): Promise<PerformanceMetrics> {
    const timestamp = Date.now();
    
    const [
      systemMetrics,
      databaseMetrics,
      queueMetrics,
      apiMetrics,
      workerMetrics,
      thirdPartyMetrics,
    ] = await Promise.allSettled([
      this.getSystemMetrics(),
      this.getDatabaseMetrics(),
      this.getQueueMetrics(),
      this.getAPIMetrics(),
      this.getWorkerMetrics(),
      this.getThirdPartyMetrics(),
    ]);

    return {
      timestamp,
      system: systemMetrics.status === 'fulfilled' ? systemMetrics.value : this.getDefaultSystemMetrics(),
      database: databaseMetrics.status === 'fulfilled' ? databaseMetrics.value : this.getDefaultDatabaseMetrics(),
      queues: queueMetrics.status === 'fulfilled' ? queueMetrics.value : this.getDefaultQueueMetrics(),
      api: apiMetrics.status === 'fulfilled' ? apiMetrics.value : this.getDefaultAPIMetrics(),
      workers: workerMetrics.status === 'fulfilled' ? workerMetrics.value : this.getDefaultWorkerMetrics(),
      thirdParty: thirdPartyMetrics.status === 'fulfilled' ? thirdPartyMetrics.value : this.getDefaultThirdPartyMetrics(),
    };
  }

  private async getSystemMetrics(): Promise<PerformanceMetrics['system']> {
    const startUsage = process.cpuUsage();
    const startTime = Date.now();

    // Wait a bit to get accurate CPU usage
    await new Promise(resolve => setTimeout(resolve, 100));

    const endUsage = process.cpuUsage(startUsage);
    const endTime = Date.now();

    // Calculate CPU percentage
    const cpuUsage = ((endUsage.user + endUsage.system) / 1000000) / (endTime - startTime) * 100;

    const memUsage = process.memoryUsage();
    const os = require('os');
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      cpu: Math.min(Math.round(cpuUsage * 100) / 100, 100), // Cap at 100%
      memory: {
        used: usedMemory,
        total: totalMemory,
        free: freeMemory,
        percentage: Math.round((usedMemory / totalMemory) * 100),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      },
      uptime: process.uptime(),
      loadAverage: os.loadavg(),
    };
  }

  private async getDatabaseMetrics(): Promise<PerformanceMetrics['database']> {
    try {
      const startTime = Date.now();
      
      // Test query to measure response time
      await db.execute(sql`SELECT 1 as test`);
      const queryTime = Date.now() - startTime;

      // Get connection stats
      const connectionResult = await db.execute(sql`
        SELECT count(*) as active_connections
        FROM pg_stat_activity
        WHERE state = 'active'
      `);

      const activeConnections = parseInt(connectionResult[0]?.active_connections || '0');
      const maxConnections = 20; // Your configured max connections
      const connectionPoolUtilization = Math.round((activeConnections / maxConnections) * 100);

      // Check for slow queries (if pg_stat_statements is available)
      let slowQueries = 0;
      try {
        const slowQueryResult = await db.execute(sql`
          SELECT count(*) as slow_queries
          FROM pg_stat_statements
          WHERE mean_time > 1000
          AND calls > 10
        `);
        slowQueries = parseInt(slowQueryResult[0]?.slow_queries || '0');
      } catch (error) {
        // pg_stat_statements might not be available
      }

      return {
        activeConnections,
        maxConnections,
        queryTime,
        slowQueries,
        connectionPoolUtilization,
      };
    } catch (error) {
      logger.error('Failed to get database metrics:', error);
      return this.getDefaultDatabaseMetrics();
    }
  }

  private async getQueueMetrics(): Promise<PerformanceMetrics['queues']> {
    try {
      const { queues } = await import('./comprehensiveQueues');
      
      let totalWaiting = 0;
      let totalActive = 0;
      let totalCompleted = 0;
      let totalFailed = 0;
      let totalDelayed = 0;
      let totalStalled = 0;

      const byQueue: Record<string, any> = {};

      for (const [queueName, queue] of Object.entries(queues)) {
        try {
          const counts = await queue.getJobCounts();
          
          totalWaiting += counts.waiting || 0;
          totalActive += counts.active || 0;
          totalCompleted += counts.completed || 0;
          totalFailed += counts.failed || 0;
          totalDelayed += counts.delayed || 0;
          totalStalled += counts.stalled || 0;

          byQueue[queueName] = {
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
          };
        } catch (error) {
          logger.warn(`Failed to get metrics for queue ${queueName}:`, error.message);
          byQueue[queueName] = { waiting: 0, active: 0, completed: 0, failed: 0 };
        }
      }

      return {
        waiting: totalWaiting,
        active: totalActive,
        completed: totalCompleted,
        failed: totalFailed,
        delayed: totalDelayed,
        stalled: totalStalled,
        totalJobs: totalWaiting + totalActive + totalDelayed,
        byQueue,
      };
    } catch (error) {
      logger.error('Failed to get queue metrics:', error);
      return this.getDefaultQueueMetrics();
    }
  }

  private async getAPIMetrics(): Promise<PerformanceMetrics['api']> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old entries
    this.responseTimes = this.responseTimes.filter(time => time > oneMinuteAgo);
    
    // Calculate metrics
    const requestsPerMinute = this.responseTimes.length;
    const averageResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0;

    // Calculate percentiles
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    
    const p95ResponseTime = sortedTimes[p95Index] || 0;
    const p99ResponseTime = sortedTimes[p99Index] || 0;

    // Calculate error rate
    const totalRequests = Array.from(this.requestCounts.values()).reduce((sum, count) => sum + count, 0);
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    // Estimate active users (simplified)
    const activeUsers = Math.max(1, Math.ceil(requestsPerMinute / 10)); // Rough estimate

    return {
      requestsPerMinute,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      activeUsers,
      p95ResponseTime: Math.round(p95ResponseTime),
      p99ResponseTime: Math.round(p99ResponseTime),
    };
  }

  private async getWorkerMetrics(): Promise<PerformanceMetrics['workers']> {
    const { queues } = await import('./comprehensiveQueues');
    
    const workerNames = ['intent', 'openai', 'security', 'rag', 'rocketreach'] as const;
    const workers: any = {};

    for (const workerName of workerNames) {
      try {
        const queue = queues[workerName];
        if (queue) {
          const counts = await queue.getJobCounts();
          const completed = counts.completed || 0;
          const failed = counts.failed || 0;
          const total = completed + failed;
          
          workers[`${workerName}Worker`] = {
            jobsProcessed: total,
            averageProcessingTime: 0, // Would need to track this separately
            successRate: total > 0 ? Math.round((completed / total) * 100) : 100,
            failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
            activeJobs: counts.active || 0,
            queueDepth: counts.waiting || 0,
          };
        } else {
          workers[`${workerName}Worker`] = this.getDefaultWorkerMetric();
        }
      } catch (error) {
        workers[`${workerName}Worker`] = this.getDefaultWorkerMetric();
      }
    }

    return workers;
  }

  private async getThirdPartyMetrics(): Promise<PerformanceMetrics['thirdParty']> {
    try {
      const [openaiMetrics, rocketreachMetrics] = await Promise.all([
        this.getOpenAIMetrics(),
        this.getRocketReachMetrics(),
      ]);

      return {
        openai: openaiMetrics,
        rocketreach: rocketreachMetrics,
      };
    } catch (error) {
      logger.error('Failed to get third-party metrics:', error);
      return this.getDefaultThirdPartyMetrics();
    }
  }

  private async getOpenAIMetrics(): Promise<PerformanceMetrics['thirdParty']['openai']> {
    try {
      const [callsCount, successCount, failureCount, tokensUsed] = await Promise.all([
        redis.get('openai:calls:count') || '0',
        redis.get('openai:calls:success') || '0',
        redis.get('openai:calls:failure') || '0',
        redis.get('openai:tokens:used') || '0',
      ]);

      const totalCalls = parseInt(callsCount);
      const successful = parseInt(successCount);
      const failed = parseInt(failureCount);
      const tokens = parseInt(tokensUsed);

      return {
        callsPerMinute: totalCalls,
        successRate: totalCalls > 0 ? Math.round((successful / totalCalls) * 100) : 100,
        averageResponseTime: 2000, // Default estimate
        rateLimitHits: failed, // Simplified
        tokensUsed: tokens,
      };
    } catch (error) {
      return {
        callsPerMinute: 0,
        successRate: 100,
        averageResponseTime: 0,
        rateLimitHits: 0,
        tokensUsed: 0,
      };
    }
  }

  private async getRocketReachMetrics(): Promise<PerformanceMetrics['thirdParty']['rocketreach']> {
    try {
      const [callsCount, successCount, failureCount, creditsUsed] = await Promise.all([
        redis.get('rocketreach:calls:count') || '0',
        redis.get('rocketreach:calls:success') || '0',
        redis.get('rocketreach:calls:failure') || '0',
        redis.get('rocketreach:credits:used') || '0',
      ]);

      const totalCalls = parseInt(callsCount);
      const successful = parseInt(successCount);
      const failed = parseInt(failureCount);
      const credits = parseInt(creditsUsed);

      return {
        callsPerMinute: totalCalls,
        successRate: totalCalls > 0 ? Math.round((successful / totalCalls) * 100) : 100,
        averageResponseTime: 3000, // Default estimate
        rateLimitHits: failed, // Simplified
        creditsUsed: credits,
      };
    } catch (error) {
      return {
        callsPerMinute: 0,
        successRate: 100,
        averageResponseTime: 0,
        rateLimitHits: 0,
        creditsUsed: 0,
      };
    }
  }

  // Track API request/response for metrics
  trackAPIRequest(path: string, method: string, responseTime: number, statusCode: number) {
    const now = Date.now();
    this.responseTimes.push(responseTime);

    const key = `${method}:${path}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

    if (statusCode >= 400) {
      this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
    }

    // Clean old entries periodically
    if (this.responseTimes.length > 1000) {
      const fiveMinutesAgo = now - 300000;
      this.responseTimes = this.responseTimes.filter(time => time > fiveMinutesAgo);
    }
  }

  private checkAlerts(metrics: PerformanceMetrics): void {
    const newAlerts: Alert[] = [];

    // System alerts
    if (metrics.system.cpu >= this.alertThresholds.cpu.critical) {
      newAlerts.push(this.createAlert('critical', 'Critical CPU Usage', `CPU usage is at ${metrics.system.cpu}%`, 'system.cpu', metrics.system.cpu, this.alertThresholds.cpu.critical));
    } else if (metrics.system.cpu >= this.alertThresholds.cpu.error) {
      newAlerts.push(this.createAlert('error', 'High CPU Usage', `CPU usage is at ${metrics.system.cpu}%`, 'system.cpu', metrics.system.cpu, this.alertThresholds.cpu.error));
    } else if (metrics.system.cpu >= this.alertThresholds.cpu.warning) {
      newAlerts.push(this.createAlert('warning', 'Elevated CPU Usage', `CPU usage is at ${metrics.system.cpu}%`, 'system.cpu', metrics.system.cpu, this.alertThresholds.cpu.warning));
    }

    // Memory alerts
    if (metrics.system.memory.percentage >= this.alertThresholds.memory.critical) {
      newAlerts.push(this.createAlert('critical', 'Critical Memory Usage', `Memory usage is at ${metrics.system.memory.percentage}%`, 'system.memory', metrics.system.memory.percentage, this.alertThresholds.memory.critical));
    } else if (metrics.system.memory.percentage >= this.alertThresholds.memory.error) {
      newAlerts.push(this.createAlert('error', 'High Memory Usage', `Memory usage is at ${metrics.system.memory.percentage}%`, 'system.memory', metrics.system.memory.percentage, this.alertThresholds.memory.error));
    } else if (metrics.system.memory.percentage >= this.alertThresholds.memory.warning) {
      newAlerts.push(this.createAlert('warning', 'Elevated Memory Usage', `Memory usage is at ${metrics.system.memory.percentage}%`, 'system.memory', metrics.system.memory.percentage, this.alertThresholds.memory.warning));
    }

    // Database alerts
    if (metrics.database.activeConnections >= this.alertThresholds.databaseConnections.critical) {
      newAlerts.push(this.createAlert('critical', 'Database Connection Limit', `${metrics.database.activeConnections} active connections`, 'database.connections', metrics.database.activeConnections, this.alertThresholds.databaseConnections.critical));
    }

    // Queue alerts
    if (metrics.queues.totalJobs >= this.alertThresholds.queueSize.critical) {
      newAlerts.push(this.createAlert('critical', 'Queue Overload', `${metrics.queues.totalJobs} jobs in queue`, 'queue.size', metrics.queues.totalJobs, this.alertThresholds.queueSize.critical));
    }

    // API alerts
    if (metrics.api.errorRate >= this.alertThresholds.errorRate.error) {
      newAlerts.push(this.createAlert('error', 'High Error Rate', `API error rate is ${metrics.api.errorRate}%`, 'api.errorRate', metrics.api.errorRate, this.alertThresholds.errorRate.error));
    }

    // Add new alerts and emit events
    this.alerts.push(...newAlerts);
    newAlerts.forEach(alert => {
      this.emit('alert', alert);
      logger.warn('🚨 Performance alert triggered:', {
        type: alert.type,
        title: alert.title,
        message: alert.message,
        value: alert.value,
        threshold: alert.threshold,
      });
    });

    // Clean up old alerts (older than 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
  }

  private createAlert(
    type: Alert['type'],
    title: string,
    message: string,
    metric: string,
    value: number,
    threshold: number
  ): Alert {
    return {
      id: `${metric}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      metric,
      value,
      threshold,
      timestamp: Date.now(),
      acknowledged: false,
      resolved: false,
      category: metric.split('.')[0] as Alert['category'],
    };
  }

  // Default metrics for fallback
  private getDefaultSystemMetrics(): PerformanceMetrics['system'] {
    return {
      cpu: 0,
      memory: { used: 0, total: 0, free: 0, percentage: 0, heapUsed: 0, heapTotal: 0, external: 0 },
      uptime: 0,
      loadAverage: [0, 0, 0],
    };
  }

  private getDefaultDatabaseMetrics(): PerformanceMetrics['database'] {
    return {
      activeConnections: 0,
      maxConnections: 20,
      queryTime: 0,
      slowQueries: 0,
      connectionPoolUtilization: 0,
    };
  }

  private getDefaultQueueMetrics(): PerformanceMetrics['queues'] {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      stalled: 0,
      totalJobs: 0,
      byQueue: {},
    };
  }

  private getDefaultAPIMetrics(): PerformanceMetrics['api'] {
    return {
      requestsPerMinute: 0,
      averageResponseTime: 0,
      errorRate: 0,
      activeUsers: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
    };
  }

  private getDefaultWorkerMetric(): WorkerMetrics {
    return {
      jobsProcessed: 0,
      averageProcessingTime: 0,
      successRate: 100,
      failureRate: 0,
      activeJobs: 0,
      queueDepth: 0,
    };
  }

  private getDefaultWorkerMetrics(): PerformanceMetrics['workers'] {
    const defaultMetric = this.getDefaultWorkerMetric();
    return {
      intentWorker: defaultMetric,
      openaiWorker: defaultMetric,
      securityWorker: defaultMetric,
      ragWorker: defaultMetric,
      rocketreachWorker: defaultMetric,
    };
  }

  private getDefaultThirdPartyMetrics(): PerformanceMetrics['thirdParty'] {
    return {
      openai: {
        callsPerMinute: 0,
        successRate: 100,
        averageResponseTime: 0,
        rateLimitHits: 0,
        tokensUsed: 0,
      },
      rocketreach: {
        callsPerMinute: 0,
        successRate: 100,
        averageResponseTime: 0,
        rateLimitHits: 0,
        creditsUsed: 0,
      },
    };
  }

  // Public methods
  getMetricsHistory(limit: number = 100): PerformanceMetrics[] {
    return this.metricsHistory.slice(-limit);
  }

  getCurrentMetrics(): PerformanceMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] || null;
  }

  getAlerts(includeResolved: boolean = false): Alert[] {
    return includeResolved ? [...this.alerts] : this.alerts.filter(a => !a.resolved);
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.acknowledged = true;
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  getSystemHealthSummary(): any {
    const current = this.getCurrentMetrics();
    if (!current) return null;

    const history = this.getMetricsHistory(60); // Last 30 minutes
    const activeAlerts = this.getAlerts().length;

    return {
      status: this.calculateOverallHealth(current),
      current,
      trends: {
        cpu: this.calculateTrend(history.map(m => m.system.cpu)),
        memory: this.calculateTrend(history.map(m => m.system.memory.percentage)),
        responseTime: this.calculateTrend(history.map(m => m.api.averageResponseTime)),
        queueDepth: this.calculateTrend(history.map(m => m.queues.totalJobs)),
      },
      alerts: activeAlerts,
      uptime: current.system.uptime,
      lastUpdated: current.timestamp,
    };
  }

  private calculateOverallHealth(metrics: PerformanceMetrics): 'healthy' | 'warning' | 'critical' {
    if (
      metrics.system.cpu > this.alertThresholds.cpu.critical ||
      metrics.system.memory.percentage > this.alertThresholds.memory.critical ||
      metrics.database.activeConnections >= this.alertThresholds.databaseConnections.critical ||
      metrics.queues.totalJobs >= this.alertThresholds.queueSize.critical
    ) {
      return 'critical';
    }

    if (
      metrics.system.cpu > this.alertThresholds.cpu.warning ||
      metrics.system.memory.percentage > this.alertThresholds.memory.warning ||
      metrics.database.activeConnections >= this.alertThresholds.databaseConnections.warning ||
      metrics.api.errorRate >= this.alertThresholds.errorRate.warning
    ) {
      return 'warning';
    }

    return 'healthy';
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const recent = values.slice(-5);
    const older = values.slice(-10, -5);

    if (recent.length === 0 || older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = Math.abs(recentAvg - olderAvg) / olderAvg;

    if (change < 0.1) return 'stable';
    return recentAvg > olderAvg ? 'increasing' : 'decreasing';
  }
}

export const performanceMonitor = new PerformanceMonitorService();
