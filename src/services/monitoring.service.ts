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
      try {
        await this.checkSystemHealth();
      } catch (error) {
        logger.error('Health check interval failed', { error: (error as Error).message });
      }
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
      logger.error('Health check failed', { error: (error as Error).message });
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
      logger.error('Failed to create monitoring alert', { error: (error as Error).message });
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down monitoring service...');
    
    // Clear all intervals
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];
  }
} 