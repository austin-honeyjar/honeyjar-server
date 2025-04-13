import { AppConfig } from './types';
import { defaultConfig } from './default';

export const testConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'test',
    port: 3003,
    autoDeploy: true,
    branch: 'develop',
  },
  database: {
    ...defaultConfig.database,
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/honeyjar_test',
    maxConnections: 15,
  },
  security: {
    ...defaultConfig.security,
    cors: {
      ...defaultConfig.security.cors,
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    },
    rateLimit: {
      ...defaultConfig.security.rateLimit,
      max: 75,
    },
  },
  logging: {
    ...defaultConfig.logging,
    level: 'info',
  },
}; 