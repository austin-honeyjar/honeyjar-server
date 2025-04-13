import { AppConfig } from './types';
import { defaultConfig } from './default';

export const sandboxConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'sandbox',
    port: 3002,
    autoDeploy: true,
    branch: process.env.FEATURE_BRANCH,
  },
  database: {
    ...defaultConfig.database,
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/honeyjar_sandbox',
  },
  security: {
    ...defaultConfig.security,
    cors: {
      ...defaultConfig.security.cors,
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    },
    rateLimit: {
      ...defaultConfig.security.rateLimit,
      max: 50,
    },
  },
  logging: {
    ...defaultConfig.logging,
    level: 'debug',
  },
}; 