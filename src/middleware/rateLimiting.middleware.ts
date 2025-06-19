import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';
import logger from '../utils/logger';
import { rateLimitConfigs } from './validation.middleware';

// Store for tracking rate limit violations
interface RateLimitViolation {
  ip: string;
  endpoint: string;
  timestamp: Date;
  userAgent?: string;
  userId?: string;
}

const violations: RateLimitViolation[] = [];

// Custom skip function that allows authenticated users more requests
const createSkipFunction = (baseMax: number) => {
  return (req: Request): boolean => {
    // Skip rate limiting for health checks in development
    if (process.env.NODE_ENV === 'development' && req.path.includes('/health')) {
      return true;
    }
    
    // Don't skip any requests in production
    return false;
  };
};

// Custom key generator that considers user authentication
const createKeyGenerator = () => {
  return (req: Request): string => {
    // Use user ID if authenticated, otherwise fall back to IP
    const userId = (req as any).user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    
    // Extract real IP address (handles proxies)
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    const realIp = xForwardedFor ? xForwardedFor.split(',')[0].trim() : req.ip;
    return `ip:${realIp || 'unknown'}`;
  };
};

// Custom handler for rate limit exceeded
const createRateLimitHandler = (endpointName: string) => {
  return (req: Request, res: Response) => {
    const violation: RateLimitViolation = {
      ip: req.ip || 'unknown',
      endpoint: endpointName,
      timestamp: new Date(),
      userAgent: req.headers['user-agent'],
      userId: (req as any).user?.id
    };
    
    violations.push(violation);
    
    // Keep only last 1000 violations
    if (violations.length > 1000) {
      violations.splice(0, violations.length - 1000);
    }
    
    logger.warn('🚫 Rate limit exceeded', {
      endpoint: endpointName,
      ip: violation.ip,
      userId: violation.userId,
      userAgent: violation.userAgent,
      timestamp: violation.timestamp
    });
    
    res.status(429).json({
      status: 'error',
      message: rateLimitConfigs[endpointName as keyof typeof rateLimitConfigs]?.message || 'Too many requests',
      retryAfter: Math.ceil(rateLimitConfigs[endpointName as keyof typeof rateLimitConfigs]?.windowMs / 1000) || 900,
      code: 'RATE_LIMIT_EXCEEDED'
    });
  };
};

// Create rate limiters for different endpoints
export const articlesRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: rateLimitConfigs.articles.windowMs,
  max: rateLimitConfigs.articles.max,
  message: rateLimitConfigs.articles.message,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(),
  skip: createSkipFunction(rateLimitConfigs.articles.max),
  handler: createRateLimitHandler('articles')
});

export const revokedRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: rateLimitConfigs.revoked.windowMs,
  max: rateLimitConfigs.revoked.max,
  message: rateLimitConfigs.revoked.message,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(),
  skip: createSkipFunction(rateLimitConfigs.revoked.max),
  handler: createRateLimitHandler('revoked')
});

// General rate limiter for other endpoints
export const generalRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // More generous for general endpoints
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(),
  skip: createSkipFunction(200),
  handler: (req: Request, res: Response) => {
    logger.warn('🚫 General rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userId: (req as any).user?.id,
      userAgent: req.headers['user-agent']
    });
    
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP, please try again later',
      retryAfter: 900, // 15 minutes
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// Strict rate limiter for authentication endpoints
export const authRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Very strict for auth endpoints
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(),
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: Request, res: Response) => {
    logger.error('🚨 Auth rate limit exceeded - possible attack', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      timestamp: new Date()
    });
    
    res.status(429).json({
      status: 'error',
      message: 'Too many authentication attempts, please try again later',
      retryAfter: 900,
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    });
  }
});

// RocketReach API rate limiting (based on their limits)
export const rocketReachRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Match their 100/minute limit for most endpoints
  message: {
    status: 'error',
    message: 'Too many RocketReach requests, please try again later',
    retryAfter: '60 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per user for RocketReach
    return `rocketreach:${req.user?.id || req.ip}`;
  }
});

// Specific rate limit for person lookups (higher credit cost)
export const rocketReachPersonLookupLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute  
  max: 50, // More conservative for credit-consuming lookups
  message: {
    status: 'error',
    message: 'Too many person lookup requests, please try again later',
    retryAfter: '60 seconds'
  },
  keyGenerator: (req) => {
    return `rocketreach:person:${req.user?.id || req.ip}`;
  }
});

// Function to get rate limit statistics
export function getRateLimitStats() {
  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  
  const recentViolations = violations.filter(v => v.timestamp >= lastHour);
  
  const statsByEndpoint = recentViolations.reduce((acc, violation) => {
    if (!acc[violation.endpoint]) {
      acc[violation.endpoint] = 0;
    }
    acc[violation.endpoint]++;
    return acc;
  }, {} as Record<string, number>);
  
  const statsByIp = recentViolations.reduce((acc, violation) => {
    if (!acc[violation.ip]) {
      acc[violation.ip] = 0;
    }
    acc[violation.ip]++;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    totalViolations: recentViolations.length,
    violationsByEndpoint: statsByEndpoint,
    violationsByIp: statsByIp,
    topOffendingIps: Object.entries(statsByIp)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }))
  };
}

// Function to clear old violations
export function clearOldViolations() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  const originalLength = violations.length;
  
  for (let i = violations.length - 1; i >= 0; i--) {
    if (violations[i].timestamp < cutoff) {
      violations.splice(i, 1);
    }
  }
  
  const removed = originalLength - violations.length;
  if (removed > 0) {
    logger.info(`🧹 Cleaned up ${removed} old rate limit violations`);
  }
}

// Set up periodic cleanup
setInterval(clearOldViolations, 60 * 60 * 1000); // Clean up every hour 