import { z } from 'zod';
import { AppConfig, Environment } from './types';
import { defaultConfig } from './default';
import { developmentConfig } from './development';
import { sandboxConfig } from './sandbox';
import { testConfig } from './test';
import { demoConfig } from './demo';
import { productionConfig } from './production';
import logger from '../utils/logger';

// Configuration schema for validation
const configSchema = z.object({
  server: z.object({
    port: z.number().int().positive(),
    env: z.enum(['development', 'sandbox', 'test', 'demo', 'production']),
    apiPrefix: z.string(),
    branch: z.string().optional(),
    autoDeploy: z.boolean(),
  }),
  database: z.object({
    url: z.string().url(),
    maxConnections: z.number().int().positive().optional(),
    idleTimeoutMs: z.number().int().positive().optional(),
  }),
  security: z.object({
    cors: z.object({
      origin: z.union([z.string(), z.array(z.string())]),
      credentials: z.boolean(),
      methods: z.array(z.string()),
      allowedHeaders: z.array(z.string()),
    }),
    rateLimit: z.object({
      windowMs: z.number().int().positive(),
      max: z.number().int().positive(),
    }),
  }),
  clerk: z.object({
    secretKey: z.string(),
    apiUrl: z.string().url(),
    webhookSecret: z.string().optional(),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    format: z.enum(['json', 'text']),
  }),
});

function loadConfig(): AppConfig {
  const env = (process.env.NODE_ENV || 'development') as Environment;
  let config: AppConfig;

  switch (env) {
    case 'development':
      config = developmentConfig;
      break;
    case 'sandbox':
      config = sandboxConfig;
      break;
    case 'test':
      config = testConfig;
      break;
    case 'demo':
      config = demoConfig;
      break;
    case 'production':
      config = productionConfig;
      break;
    default:
      logger.warn(`Unknown environment: ${env}, falling back to development`);
      config = developmentConfig;
  }

  // Override with environment variables
  if (process.env.CLERK_SECRET_KEY) {
    config.clerk.secretKey = process.env.CLERK_SECRET_KEY;
  }

  if (process.env.CLERK_WEBHOOK_SECRET) {
    config.clerk.webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  }

  try {
    // Validate the configuration
    configSchema.parse(config);
    logger.info('Configuration loaded successfully', { 
      env: config.server.env,
      branch: config.server.branch,
      autoDeploy: config.server.autoDeploy,
    });
    return config;
  } catch (error) {
    logger.error('Configuration validation failed', { error });
    throw new Error('Invalid configuration');
  }
}

export const config = loadConfig(); 