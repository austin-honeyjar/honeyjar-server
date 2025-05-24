import { AppConfig } from './types';
import { defaultConfig } from './default';

export const productionConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'production',
    port: Number(process.env.PORT) || 3005,
    autoDeploy: false,
    branch: 'main',
  },
  database: {
    ...defaultConfig.database,
    url: process.env.DATABASE_URL || defaultConfig.database.url,
    maxConnections: 25,
  },
  security: {
    ...defaultConfig.security,
    cors: {
      ...defaultConfig.security.cors,
      origin: process.env.CORS_ORIGIN?.split(',') || defaultConfig.security.cors.origin,
    },
    rateLimit: {
      ...defaultConfig.security.rateLimit,
      max: 50, // More restrictive rate limiting in production
    },
  },
  logging: {
    ...defaultConfig.logging,
    level: 'info',
  },
}; 