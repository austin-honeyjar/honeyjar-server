export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

export interface SecurityConfig {
  cors: {
    origin: string | string[];
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export interface ClerkConfig {
  secretKey: string;
  apiUrl: string;
  webhookSecret?: string;
}

export type Environment = 'devlocal' | 'sandbox' | 'test' | 'demo' | 'production';

export interface ServerConfig {
  port: number;
  env: Environment;
  apiPrefix: string;
  branch?: string;
  autoDeploy: boolean;
}

export interface LogConfig {
  level: string;
  format: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  security: SecurityConfig;
  clerk: ClerkConfig;
  logging: LogConfig;
} 