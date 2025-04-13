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

export interface ServerConfig {
  port: number;
  env: string;
  apiPrefix: string;
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