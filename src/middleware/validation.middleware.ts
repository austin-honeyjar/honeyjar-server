import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../utils/logger';

// Validation schemas for documented endpoints only
export const articleSearchSchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(100),
  sequenceId: z.string().max(50).optional()
});

export const searchArticlesSchema = z.object({
  query: z.string().min(1).max(10000), // Required, 10,000 character limit
  limit: z.coerce.number().min(1).max(200).default(1),
  format: z.enum(['xml', 'json', 'rss', 'atom']).default('json'),
  recent: z.enum(['true', 'false']).optional(),
  sequence_id: z.string().max(50).optional(),
  filter_duplicates: z.enum(['true', 'false']).optional(),
  duplicate_order: z.enum(['latest', 'oldest']).optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
  relevance_percent: z.coerce.number().min(1).max(100).optional(),
  sort_by_relevance: z.enum(['true', 'false']).optional(),
  show_relevance_score: z.enum(['true', 'false']).optional(),
  show_matching_keywords: z.enum(['true', 'false']).optional()
});

export const revokedArticlesSchema = z.object({
  limit: z.coerce.number().min(1).max(10000).default(1000),
  sequenceId: z.string().max(50).default('0')
});

export const complianceClicksSchema = z.object({
  articles: z.array(z.object({
    id: z.string().min(1),
    clickUrl: z.string().url().optional(),
    licenses: z.array(z.string()).optional()
  })).min(1).max(100) // Allow up to 100 articles per batch
});

// Validation middleware factory
export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query params, body, and params
      const validation = schema.safeParse({
        ...req.query,
        ...req.body,
        ...req.params
      });

      if (!validation.success) {
        logger.warn('❌ Request validation failed', {
          endpoint: req.path,
          method: req.method,
          userId: req.user?.id,
          errors: validation.error.errors,
          inputData: {
            query: req.query,
            body: req.body,
            params: req.params
          }
        });

        return res.status(400).json({
          status: 'error',
          message: 'Invalid request parameters',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }

      // Attach validated data to request
      req.validatedData = validation.data;
      next();
    } catch (error) {
      logger.error('💥 Validation middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        endpoint: req.path
      });
      
      res.status(500).json({
        status: 'error',
        message: 'Internal validation error'
      });
    }
  };
}

// Input sanitization middleware
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Sanitize string inputs to prevent injection attacks
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  req.query = sanitizeObject(req.query);
  req.body = sanitizeObject(req.body);
  req.params = sanitizeObject(req.params);

  next();
}

// Rate limiting configuration per endpoint
export const rateLimitConfigs = {
  articles: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many article requests, please try again later'
  },
  revoked: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour (should be called less frequently)
    message: 'Too many revoked article requests, please try again later'
  }
};

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server header
  res.removeHeader('X-Powered-By');
  
  next();
}

// Declare global request type extension
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
    }
  }
} 