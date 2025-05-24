import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/appError';
import logger from '../utils/logger';

const isDev = process.env.NODE_ENV === 'development';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error occurred:', {
    error: err,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Handle AppError instances
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: err.message,
      },
    });
  }

  // Handle database errors
  if (err.name === 'DatabaseError') {
    return res.status(500).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'A database error occurred',
        details: isDev ? err.message : undefined,
      },
    });
  }

  // Handle authentication errors
  if (err.name === 'AuthenticationError') {
    return res.status(401).json({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication failed',
        details: err.message,
      },
    });
  }

  // Handle authorization errors
  if (err.name === 'AuthorizationError') {
    return res.status(403).json({
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: 'Access denied',
        details: err.message,
      },
    });
  }

  // Default error handler
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: isDev ? err.message : undefined,
    },
  });
}; 