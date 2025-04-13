import { AppConfig } from './types';

export const defaultConfig: AppConfig = {
  server: {
    port: 3005,
    env: 'devlocal',
    apiPrefix: '/api',
    autoDeploy: false,
  },
  database: {
    url: 'postgres://localhost:5432/honeyjar',
    maxConnections: 10,
    idleTimeoutMs: 30000,
  },
  security: {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005'],
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