import { z } from 'zod';
import logger from '../utils/logger';

// Configuration validation schema
const configSchema = z.object({
  // Server configuration
  server: z.object({
    port: z.number().min(1).max(65535).default(3005),
    host: z.string().default('0.0.0.0'),
    env: z.enum(['development', 'staging', 'production']).default('development'),
    corsOrigins: z.array(z.string()).default(['*']),
    requestTimeout: z.number().default(30000), // 30 seconds
    maxRequestSize: z.string().default('10mb')
  }),

  // Database configuration
  database: z.object({
    url: z.string().url().optional(),
    host: z.string().optional(),
    port: z.number().optional(),
    name: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    ssl: z.boolean().default(false),
    poolSize: z.number().min(1).max(100).default(10),
    connectionTimeout: z.number().default(10000),
    idleTimeout: z.number().default(30000)
  }),

  // Metabase API configuration
  metabase: z.object({
    apiKey: z.string().min(1),
    baseUrl: z.string().url().default('http://metabase.moreover.com'),
    username: z.string().optional(), // For source changes API
    password: z.string().optional(), // For source changes API
    timeout: z.number().default(30000),
    retries: z.number().min(0).max(10).default(3),
    rateLimit: z.object({
      minInterval: z.number().default(20000), // 20 seconds
      maxRequestsPerHour: z.number().default(180) // 3 requests per minute
    }),
    circuitBreaker: z.object({
      failureThreshold: z.number().default(5),
      recoveryTimeout: z.number().default(30000),
      monitoringPeriod: z.number().default(60000)
    })
  }),

  // Authentication configuration
  auth: z.object({
    clerkSecretKey: z.string().optional(),
    jwtSecret: z.string().min(32),
    jwtExpiresIn: z.string().default('24h'),
    devMode: z.boolean().default(false)
  }),

  // Redis configuration (for caching and rate limiting)
  redis: z.object({
    enabled: z.boolean().default(false),
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(0),
    ttl: z.number().default(3600) // 1 hour default TTL
  }),

  // Logging configuration
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
    enableConsole: z.boolean().default(true),
    enableFile: z.boolean().default(false),
    fileName: z.string().default('app.log'),
    maxFileSize: z.string().default('10m'),
    maxFiles: z.number().default(5)
  }),

  // Security configuration
  security: z.object({
    enableHelmet: z.boolean().default(true),
    enableCors: z.boolean().default(true),
    enableRateLimit: z.boolean().default(true),
    trustProxy: z.boolean().default(false),
    sessionSecret: z.string().optional(),
    bcryptRounds: z.number().min(8).max(15).default(12)
  }),

  // Feature flags
  features: z.object({
    enableAnalytics: z.boolean().default(true),
    enableMetrics: z.boolean().default(true),
    enableHealthChecks: z.boolean().default(true),
    enableSwagger: z.boolean().default(true),
    enableDebugRoutes: z.boolean().default(false),
    enableBackgroundJobs: z.boolean().default(false)
  }),

  // Monitoring configuration
  monitoring: z.object({
    enablePrometheus: z.boolean().default(false),
    metricsPort: z.number().default(9090),
    healthCheckInterval: z.number().default(30000), // 30 seconds
    alertWebhookUrl: z.string().url().optional()
  })
});

export type Config = z.infer<typeof configSchema>;

// Deep partial type for configuration overrides
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Environment-specific configurations
const environmentConfigs: Record<string, DeepPartial<Config>> = {
  development: {
    server: {
      env: 'development',
      corsOrigins: ['http://localhost:3000', 'http://localhost:3001']
    },
    logging: {
      level: 'debug',
      format: 'simple',
      enableConsole: true,
      enableFile: false
    },
    features: {
      enableSwagger: true,
      enableDebugRoutes: true,
      enableAnalytics: true
    },
    security: {
      enableRateLimit: false, // Disable for easier development
      trustProxy: false
    }
  },

  staging: {
    server: {
      env: 'staging',
      corsOrigins: ['https://staging-app.company.com']
    },
    logging: {
      level: 'info',
      format: 'json',
      enableConsole: true,
      enableFile: true
    },
    features: {
      enableSwagger: true,
      enableDebugRoutes: false,
      enableAnalytics: true,
      enableBackgroundJobs: true
    },
    security: {
      enableRateLimit: true,
      trustProxy: true
    },
    monitoring: {
      enablePrometheus: true,
      healthCheckInterval: 30000
    }
  },

  production: {
    server: {
      env: 'production',
      corsOrigins: ['https://app.company.com']
    },
    logging: {
      level: 'warn',
      format: 'json',
      enableConsole: false,
      enableFile: true
    },
    features: {
      enableSwagger: false,
      enableDebugRoutes: false,
      enableAnalytics: true,
      enableBackgroundJobs: true
    },
    security: {
      enableRateLimit: true,
      trustProxy: true,
      enableHelmet: true
    },
    monitoring: {
      enablePrometheus: true,
      healthCheckInterval: 15000 // More frequent in production
    },
    metabase: {
      rateLimit: {
        minInterval: 30000, // More conservative in production
        maxRequestsPerHour: 120
      }
    }
  }
};

// Load and validate configuration
function loadConfig(): Config {
  const env = process.env.NODE_ENV || 'development';
  
  logger.info('🔧 Loading configuration', { environment: env });

  // Build configuration from environment variables
  const envConfig = {
    server: {
      port: parseInt(process.env.PORT || '3005', 10),
      host: process.env.HOST || '0.0.0.0',
      env: env as 'development' | 'staging' | 'production',
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || undefined,
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
      maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb'
    },

    database: {
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      name: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10)
    },

    metabase: {
      apiKey: process.env.METABASE_API_KEY || '',
      baseUrl: process.env.METABASE_BASE_URL || 'http://metabase.moreover.com',
      username: process.env.METABASE_USERNAME,
      password: process.env.METABASE_PASSWORD,
      timeout: parseInt(process.env.METABASE_TIMEOUT || '30000', 10),
      retries: parseInt(process.env.METABASE_RETRIES || '3', 10),
      rateLimit: {
        minInterval: parseInt(process.env.METABASE_MIN_INTERVAL || '20000', 10),
        maxRequestsPerHour: parseInt(process.env.METABASE_MAX_REQUESTS_PER_HOUR || '180', 10)
      },
      circuitBreaker: {
        failureThreshold: parseInt(process.env.METABASE_FAILURE_THRESHOLD || '5', 10),
        recoveryTimeout: parseInt(process.env.METABASE_RECOVERY_TIMEOUT || '30000', 10),
        monitoringPeriod: parseInt(process.env.METABASE_MONITORING_PERIOD || '60000', 10)
      }
    },

    auth: {
      clerkSecretKey: process.env.CLERK_SECRET_KEY,
      jwtSecret: process.env.JWT_SECRET || '',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      devMode: process.env.AUTH_DEV_MODE === 'true'
    },

    redis: {
      enabled: process.env.REDIS_ENABLED === 'true',
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      ttl: parseInt(process.env.REDIS_TTL || '3600', 10)
    },

    logging: {
      level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
      format: (process.env.LOG_FORMAT || 'json') as 'json' | 'simple',
      enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
      enableFile: process.env.LOG_ENABLE_FILE === 'true',
      fileName: process.env.LOG_FILE_NAME || 'app.log',
      maxFileSize: process.env.LOG_MAX_FILE_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10)
    },

    security: {
      enableHelmet: process.env.SECURITY_ENABLE_HELMET !== 'false',
      enableCors: process.env.SECURITY_ENABLE_CORS !== 'false',
      enableRateLimit: process.env.SECURITY_ENABLE_RATE_LIMIT !== 'false',
      trustProxy: process.env.SECURITY_TRUST_PROXY === 'true',
      sessionSecret: process.env.SESSION_SECRET,
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10)
    },

    features: {
      enableAnalytics: process.env.FEATURE_ENABLE_ANALYTICS !== 'false',
      enableMetrics: process.env.FEATURE_ENABLE_METRICS !== 'false',
      enableHealthChecks: process.env.FEATURE_ENABLE_HEALTH_CHECKS !== 'false',
      enableSwagger: process.env.FEATURE_ENABLE_SWAGGER !== 'false',
      enableDebugRoutes: process.env.FEATURE_ENABLE_DEBUG_ROUTES === 'true',
      enableBackgroundJobs: process.env.FEATURE_ENABLE_BACKGROUND_JOBS === 'true'
    },

    monitoring: {
      enablePrometheus: process.env.MONITORING_ENABLE_PROMETHEUS === 'true',
      metricsPort: parseInt(process.env.MONITORING_METRICS_PORT || '9090', 10),
      healthCheckInterval: parseInt(process.env.MONITORING_HEALTH_CHECK_INTERVAL || '30000', 10),
      alertWebhookUrl: process.env.MONITORING_ALERT_WEBHOOK_URL
    }
  };

  // Merge with environment-specific defaults
  const envDefaults = environmentConfigs[env] || {};
  const mergedConfig = deepMerge(envDefaults, envConfig);

  try {
    const validatedConfig = configSchema.parse(mergedConfig);
    
    logger.info('✅ Configuration loaded and validated successfully', {
      environment: validatedConfig.server.env,
      port: validatedConfig.server.port,
      features: validatedConfig.features,
      hasMetabaseKey: !!validatedConfig.metabase.apiKey,
      hasJwtSecret: !!validatedConfig.auth.jwtSecret
    });

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('❌ Configuration validation failed', {
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          received: err.code === 'invalid_type' ? (err as any).received : undefined
        }))
      });
      
      throw new Error(`Configuration validation failed: ${error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', ')}`);
    }
    throw error;
  }
}

// Deep merge utility function
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  
  return result;
}

// Export the loaded configuration
export const config = loadConfig();

// Configuration validation for critical environment variables
export function validateCriticalConfig(): void {
  const criticalErrors: string[] = [];

  if (!config.metabase.apiKey) {
    criticalErrors.push('METABASE_API_KEY is required');
  }

  if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32) {
    criticalErrors.push('JWT_SECRET is required and must be at least 32 characters');
  }

  if (config.server.env === 'production') {
    if (!config.auth.clerkSecretKey) {
      criticalErrors.push('CLERK_SECRET_KEY is required in production');
    }

    if (config.features.enableSwagger) {
      logger.warn('⚠️ Swagger is enabled in production - consider disabling for security');
    }

    if (config.features.enableDebugRoutes) {
      criticalErrors.push('Debug routes should not be enabled in production');
    }
  }

  if (criticalErrors.length > 0) {
    logger.error('🚨 Critical configuration errors detected', { errors: criticalErrors });
    throw new Error(`Critical configuration errors: ${criticalErrors.join(', ')}`);
  }

  logger.info('✅ Critical configuration validation passed');
}

// Helper function to get configuration for a specific service
export function getServiceConfig<K extends keyof Config>(service: K): Config[K] {
  return config[service];
}

// Helper function to check if a feature is enabled
export function isFeatureEnabled(feature: keyof Config['features']): boolean {
  return config.features[feature];
}

// Export individual configuration sections for convenience
export const serverConfig = config.server;
export const databaseConfig = config.database;
export const metabaseConfig = config.metabase;
export const authConfig = config.auth;
export const redisConfig = config.redis;
export const loggingConfig = config.logging;
export const securityConfig = config.security;
export const featuresConfig = config.features;
export const monitoringConfig = config.monitoring; 