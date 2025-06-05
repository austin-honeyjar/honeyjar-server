import Redis from 'ioredis';
import logger from '../utils/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean; // Whether to compress large values
}

export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  totalKeys: number;
  memoryUsage?: number;
}

// Redis configuration from environment variables
const redisConfig = {
  enabled: process.env.REDIS_ENABLED === 'true',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  ttl: parseInt(process.env.REDIS_TTL || '3600', 10)
};

export class CacheService {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    totalKeys: 0
  };

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!redisConfig.enabled) {
      logger.info('📦 Redis caching disabled via configuration');
      return;
    }

    try {
      this.redis = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        // Connection timeout
        connectTimeout: 10000,
        // Command timeout
        commandTimeout: 5000,
        // Reconnect settings
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          return err.message.includes(targetError);
        }
      });

      // Connection event handlers
      this.redis.on('connect', () => {
        logger.info('🔗 Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        logger.info('✅ Redis ready for operations');
      });

      this.redis.on('error', (error) => {
        logger.error('❌ Redis connection error:', error);
        this.isConnected = false;
        this.stats.errors++;
      });

      this.redis.on('reconnecting', () => {
        logger.info('🔄 Redis reconnecting...');
        this.isConnected = false;
      });

      this.redis.on('end', () => {
        logger.warn('⚠️ Redis connection ended');
        this.isConnected = false;
      });

      // Attempt initial connection
      await this.redis.connect();
    } catch (error) {
      logger.error('💥 Failed to initialize Redis cache:', error);
      this.redis = null;
      this.isConnected = false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      this.stats.misses++;
      return null;
    }

    try {
      const value = await this.redis!.get(this.formatKey(key));
      
      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return this.deserialize<T>(value);
    } catch (error) {
      logger.error('❌ Cache get error:', { key, error });
      this.stats.errors++;
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const serializedValue = this.serialize(value);
      const ttl = options?.ttl || redisConfig.ttl;
      
      const result = await this.redis!.setex(
        this.formatKey(key),
        ttl,
        serializedValue
      );
      
      return result === 'OK';
    } catch (error) {
      logger.error('❌ Cache set error:', { key, error });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.redis!.del(this.formatKey(key));
      return result > 0;
    } catch (error) {
      logger.error('❌ Cache delete error:', { key, error });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.redis!.exists(this.formatKey(key));
      return result === 1;
    } catch (error) {
      logger.error('❌ Cache exists error:', { key, error });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    if (!this.isAvailable() || keys.length === 0) {
      this.stats.misses += keys.length;
      return keys.map(() => null);
    }

    try {
      const formattedKeys = keys.map(key => this.formatKey(key));
      const values = await this.redis!.mget(...formattedKeys);
      
      return values.map((value, index) => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        return this.deserialize<T>(value);
      });
    } catch (error) {
      logger.error('❌ Cache mget error:', { keys, error });
      this.stats.errors++;
      this.stats.misses += keys.length;
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean> {
    if (!this.isAvailable() || keyValuePairs.length === 0) {
      return false;
    }

    try {
      const pipeline = this.redis!.pipeline();
      
      for (const { key, value, ttl } of keyValuePairs) {
        const serializedValue = this.serialize(value);
        const expiration = ttl || redisConfig.ttl;
        pipeline.setex(this.formatKey(key), expiration, serializedValue);
      }
      
      const results = await pipeline.exec();
      return results?.every(([error, result]) => error === null && result === 'OK') || false;
    } catch (error) {
      logger.error('❌ Cache mset error:', { count: keyValuePairs.length, error });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  async clear(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.redis!.flushdb();
      logger.info('🧹 Cache cleared successfully');
      return true;
    } catch (error) {
      logger.error('❌ Cache clear error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (!this.isAvailable()) {
      return { ...this.stats, totalKeys: 0 };
    }

    try {
      const info = await this.redis!.info('memory');
      const dbSize = await this.redis!.dbsize();
      
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : undefined;

      return {
        ...this.stats,
        totalKeys: dbSize,
        memoryUsage
      };
    } catch (error) {
      logger.error('❌ Cache stats error:', error);
      return { ...this.stats, totalKeys: 0 };
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    if (!redisConfig.enabled) {
      return {
        status: 'healthy',
        details: { message: 'Redis disabled via configuration' }
      };
    }

    if (!this.isAvailable()) {
      return {
        status: 'unhealthy',
        details: { message: 'Redis not connected', connected: false }
      };
    }

    try {
      const start = Date.now();
      await this.redis!.ping();
      const responseTime = Date.now() - start;
      
      const stats = await this.getStats();
      
      return {
        status: 'healthy',
        details: {
          connected: true,
          responseTime,
          stats
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { 
          message: 'Redis ping failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }
      };
    }
  }

  /**
   * Generate a cache key for articles
   */
  generateArticleKey(params: any): string {
    const { query, limit, sortBy, startDate, endDate, sources } = params;
    const keyParts = [
      'articles',
      query || 'no-query',
      `limit-${limit}`,
      `sort-${sortBy}`,
      startDate ? `from-${startDate}` : '',
      endDate ? `to-${endDate}` : '',
      sources ? `sources-${Array.isArray(sources) ? sources.join('-') : sources}` : ''
    ].filter(Boolean);
    
    return keyParts.join(':');
  }

  /**
   * Generate a cache key for revoked articles
   */
  generateRevokedKey(params: any): string {
    const { limit, sequenceId } = params;
    return `revoked:limit-${limit}:seq-${sequenceId || '0'}`;
  }

  /**
   * Generate a cache key for search articles
   */
  generateSearchKey(params: any): string {
    const { query, limit, format, recent, sequence_id, filter_duplicates, sort, relevance_percent } = params;
    const keyParts = [
      'search',
      `query-${query}`,
      `limit-${limit}`,
      format ? `format-${format}` : '',
      recent ? 'recent' : '',
      sequence_id ? `seq-${sequence_id}` : '',
      filter_duplicates ? 'dedup' : '',
      sort ? `sort-${sort}` : '',
      relevance_percent ? `rel-${relevance_percent}` : ''
    ].filter(Boolean);
    
    return keyParts.join(':');
  }

  /**
   * Gracefully close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.disconnect();
        logger.info('🔌 Redis connection closed gracefully');
      } catch (error) {
        logger.error('❌ Error closing Redis connection:', error);
      }
    }
  }

  // Private helper methods
  private isAvailable(): boolean {
    return this.redis !== null && this.isConnected;
  }

  private formatKey(key: string): string {
    const prefix = process.env.NODE_ENV || 'dev';
    return `honeyjar:${prefix}:${key}`;
  }

  private serialize(value: any): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      logger.error('❌ Cache serialization error:', error);
      return '';
    }
  }

  private deserialize<T>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('❌ Cache deserialization error:', error);
      return null;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Helper functions for common caching patterns
export const withCache = async <T>(
  key: string,
  fetchFunction: () => Promise<T>,
  options?: CacheOptions
): Promise<T> => {
  // Try to get from cache first
  const cached = await cacheService.get<T>(key);
  if (cached !== null) {
    logger.debug('📦 Cache hit', { key });
    return cached;
  }

  // Fetch fresh data
  logger.debug('🔄 Cache miss, fetching fresh data', { key });
  const freshData = await fetchFunction();
  
  // Store in cache for next time (don't await to avoid blocking)
  cacheService.set(key, freshData, options).catch(error => 
    logger.error('❌ Failed to cache data:', { key, error })
  );
  
  return freshData;
};

export default cacheService; 