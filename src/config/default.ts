import { AppConfig } from './types.js';

export const defaultConfig: AppConfig = {
  server: {
    port: 3001,
    env: 'development',
    apiPrefix: '/api',
  },
  database: {
    url: 'postgres://localhost:5432/honeyjar',
    maxConnections: 10,
    idleTimeoutMs: 30000,
  },
  security: {
    cors: {
      origin: ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per window
    },
  },
  clerk: {
    secretKey: '',
    apiUrl: 'https://api.clerk.dev',
  },
  logging: {
    level: 'info',
    format: 'json',
  },
}; 