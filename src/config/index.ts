import { z } from 'zod';
import { AppConfig } from './types.js';
import { defaultConfig } from './default.js';
import { developmentConfig } from './development.js';
import { productionConfig } from './production.js';
import logger from '../utils/logger.js';

// Configuration schema for validation
const configSchema = z.object({
  server: z.object({
    port: z.number().int().positive(),
    env: z.enum(['development', 'production']),
    apiPrefix: z.string(),
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
  const env = process.env.NODE_ENV || 'development';
  let config: AppConfig;

  switch (env) {
    case 'production':
      config = productionConfig;
      break;
    case 'development':
    default:
      config = developmentConfig;
      break;
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
    logger.info('Configuration loaded successfully', { env });
    return config;
  } catch (error) {
    logger.error('Configuration validation failed', { error });
    throw new Error('Invalid configuration');
  }
}

export const config = loadConfig(); 