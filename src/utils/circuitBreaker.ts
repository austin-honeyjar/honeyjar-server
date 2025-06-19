import logger from './logger';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  fallbackFunction?: () => Promise<any>;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: any) => boolean;
}

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        logger.info('🔄 Circuit breaker attempting reset (HALF_OPEN)', {
          failureCount: this.failureCount,
          lastFailureTime: this.lastFailureTime
        });
      } else {
        const error = new Error('Circuit breaker is OPEN - service unavailable');
        logger.warn('🚫 Circuit breaker blocked request', {
          state: this.state,
          failureCount: this.failureCount,
          nextAttemptTime: this.nextAttemptTime
        });
        
        if (this.options.fallbackFunction) {
          logger.info('🔄 Executing fallback function');
          return await this.options.fallbackFunction();
        }
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
    logger.debug('✅ Circuit breaker success - state reset to CLOSED');
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = new Date(Date.now() + this.options.recoveryTimeout);
      
      logger.error('🚨 Circuit breaker OPENED', {
        failureCount: this.failureCount,
        threshold: this.options.failureThreshold,
        nextAttemptTime: this.nextAttemptTime
      });
    } else {
      logger.warn('⚠️ Circuit breaker failure recorded', {
        failureCount: this.failureCount,
        threshold: this.options.failureThreshold
      });
    }
  }

  private shouldAttemptReset(): boolean {
    return this.nextAttemptTime ? new Date() >= this.nextAttemptTime : false;
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }
}

export class RetryManager {
  constructor(private options: RetryOptions) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          logger.info(`🔄 Retry attempt ${attempt}/${this.options.maxRetries} after ${delay}ms delay`);
          await this.sleep(delay);
        }
        
        return await operation();
      } catch (error) {
        lastError = error;
        
        logger.warn(`❌ Attempt ${attempt + 1} failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempt: attempt + 1,
          maxRetries: this.options.maxRetries
        });

        // Check if we should retry this error
        if (this.options.retryCondition && !this.options.retryCondition(error)) {
          logger.info('🚫 Error not retryable, giving up');
          throw error;
        }

        // Don't wait after the last attempt
        if (attempt === this.options.maxRetries) {
          break;
        }
      }
    }

    logger.error('💥 All retry attempts exhausted', {
      totalAttempts: this.options.maxRetries + 1,
      finalError: lastError instanceof Error ? lastError.message : 'Unknown error'
    });
    
    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.options.baseDelay * Math.pow(this.options.backoffFactor, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
    return Math.min(exponentialDelay + jitter, this.options.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default configurations for different operations
export const circuitBreakerConfigs = {
  metabaseApi: {
    failureThreshold: 5,      // Open after 5 failures
    recoveryTimeout: 30000,   // Wait 30 seconds before retry
    monitoringPeriod: 60000   // Monitor for 1 minute
  },
  sourceChanges: {
    failureThreshold: 3,      // More sensitive for less critical endpoint
    recoveryTimeout: 60000,   // Wait 1 minute before retry
    monitoringPeriod: 120000  // Monitor for 2 minutes
  }
};

export const retryConfigs = {
  metabaseApi: {
    maxRetries: 3,
    baseDelay: 1000,         // Start with 1 second
    maxDelay: 10000,         // Max 10 seconds
    backoffFactor: 2,        // Exponential backoff
    retryCondition: (error: any) => {
      // Retry on network errors and 5xx status codes
      const retryableErrors = [
        'ECONNRESET',
        'ENOTFOUND', 
        'ECONNREFUSED',
        'ETIMEDOUT'
      ];
      
      if (error.code && retryableErrors.includes(error.code)) {
        return true;
      }
      
      if (error.response?.status >= 500) {
        return true;
      }
      
      // Don't retry on 4xx errors (client errors)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        return false;
      }
      
      return true; // Retry unknown errors
    }
  },
  sourceChanges: {
    maxRetries: 2,
    baseDelay: 2000,
    maxDelay: 8000,
    backoffFactor: 2,
    retryCondition: (error: any) => {
      // More conservative retry for source changes
      return error.response?.status >= 500;
    }
  }
};

// Fallback functions for different services
export const fallbackFunctions = {
  async metabaseArticles() {
    logger.info('🔄 Using fallback for articles - returning cached/empty response');
    return {
      articles: [],
      totalCount: 0,
      hasMore: false,
      lastSequenceId: undefined
    };
  },
  
  async metabaseRevokedArticles() {
    logger.info('🔄 Using fallback for revoked articles - returning empty response');
    return {
      revokedArticles: [],
      sequenceId: '0',
      totalCount: 0
    };
  },
  
  async sourceChanges() {
    logger.info('🔄 Using fallback for source changes - returning empty response');
    return {
      changes: [],
      date: new Date().toISOString().split('T')[0]
    };
  }
};

// Factory function to create configured circuit breaker + retry
export function createResilientOperation<T>(
  operation: () => Promise<T>,
  circuitConfig: CircuitBreakerOptions,
  retryConfig: RetryOptions
) {
  const circuitBreaker = new CircuitBreaker(circuitConfig);
  const retryManager = new RetryManager(retryConfig);
  
  return async (): Promise<T> => {
    return await circuitBreaker.execute(async () => {
      return await retryManager.execute(operation);
    });
  };
} 