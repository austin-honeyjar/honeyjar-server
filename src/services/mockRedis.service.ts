// Mock Redis service for testing without external Redis dependency
import { EventEmitter } from 'events';
import logger from '../utils/logger';

export class MockRedisService extends EventEmitter {
  private store = new Map<string, { value: string; expiry?: number }>();
  private connected = true;

  constructor() {
    super();
    logger.info('🧪 Using Mock Redis for testing (in-memory)');
    // Emit ready event after short delay to simulate real Redis
    setTimeout(() => this.emit('ready'), 100);
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emit('connect');
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('end');
    return Promise.resolve();
  }

  async quit(): Promise<string> {
    await this.disconnect();
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    
    // Check expiry
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: string): Promise<string> {
    this.store.set(key, { value });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    const expiry = Date.now() + (seconds * 1000);
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    
    // Check expiry
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return 0;
    }
    
    return 1;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map(key => this.get(key)));
  }

  async flushdb(): Promise<string> {
    this.store.clear();
    return 'OK';
  }

  async dbsize(): Promise<number> {
    // Clean expired keys first
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (item.expiry && now > item.expiry) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }

  async info(section?: string): Promise<string> {
    if (section === 'memory') {
      const memoryUsage = JSON.stringify([...this.store.values()]).length;
      return `used_memory:${memoryUsage}`;
    }
    return 'mock_redis_server:testing\nversion:mock\n';
  }

  // Bull Queue compatibility methods
  pipeline() {
    return {
      setex: (key: string, seconds: number, value: string) => {
        this.setex(key, seconds, value);
        return this;
      },
      exec: async () => {
        return [[null, 'OK']]; // [error, result] format
      }
    };
  }

  // Additional methods needed for Bull
  async brpop(key: string, timeout: number): Promise<[string, string] | null> {
    // Simple implementation - in real Redis this blocks
    return null;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const existing = await this.get(key);
    const list = existing ? JSON.parse(existing) : [];
    list.unshift(...values);
    await this.set(key, JSON.stringify(list));
    return list.length;
  }

  async llen(key: string): Promise<number> {
    const existing = await this.get(key);
    if (!existing) return 0;
    try {
      const list = JSON.parse(existing);
      return Array.isArray(list) ? list.length : 0;
    } catch {
      return 0;
    }
  }

  // Event compatibility
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

export const createMockRedis = () => new MockRedisService();
