import { AppConfig } from './types.js';
import { defaultConfig } from './default.js';

export const productionConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'production',
    port: Number(process.env.PORT) || 3001,
  },
  database: {
    ...defaultConfig.database,
    url: process.env.DATABASE_URL || defaultConfig.database.url,
    maxConnections: 20,
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