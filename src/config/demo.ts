import { AppConfig } from './types';
import { defaultConfig } from './default';

export const demoConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'demo',
    port: 3004,
    autoDeploy: true,
    branch: 'main',
  },
  database: {
    ...defaultConfig.database,
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/honeyjar_demo',
    maxConnections: 20,
  },
  security: {
    ...defaultConfig.security,
    cors: {
      ...defaultConfig.security.cors,
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    },
    rateLimit: {
      ...defaultConfig.security.rateLimit,
      max: 100,
    },
  },
  logging: {
    ...defaultConfig.logging,
    level: 'info',
  },
}; 