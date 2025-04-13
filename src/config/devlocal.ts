import { AppConfig } from './types';
import { defaultConfig } from './default';

export const devlocalConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'devlocal',
    port: 3005,
    apiPrefix: '/api/v1',
    autoDeploy: false,
    branch: 'local',
  },
  database: {
    ...defaultConfig.database,
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/honeyjar_devlocal',
    maxConnections: 5,
    idleTimeoutMs: 10000,
  },
  security: {
    ...defaultConfig.security,
    cors: {
      ...defaultConfig.security.cors,
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    },
    rateLimit: {
      ...defaultConfig.security.rateLimit,
      max: 1000, // Higher limit for local development
    },
  },
  logging: {
    ...defaultConfig.logging,
    level: 'debug',
    format: 'text', // More readable format for local development
  },
}; 