import { AppConfig } from './types';
import { defaultConfig } from './default';

export const sandboxConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    port: parseInt(process.env.PORT || '3005'),
    env: 'sandbox',
    apiPrefix: '/api/v1',
    autoDeploy: true,
  },
  database: {
    ...defaultConfig.database,
    url: process.env.DATABASE_URL || defaultConfig.database.url,
    maxConnections: 20,
    idleTimeoutMs: 60000,
  },
  security: {
    ...defaultConfig.security,
    cors: {
      ...defaultConfig.security.cors,
      origin: '*', // Update with specific domains for production
      credentials: true,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // Limit each IP to 200 requests per window
    },
  },
  logging: {
    level: 'info',
    format: 'json',
  },
}; 