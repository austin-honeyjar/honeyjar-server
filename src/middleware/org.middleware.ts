import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/auth.service.js';
import { ApiError } from '../utils/error.js';
import logger from '../utils/logger.js';

// Debug constants need to match those in auth.middleware
const DEBUG_TOKEN = 'debug-auth-123456';
const DEBUG_USER_ID = 'debug-user-123';

/**
 * Middleware to check if the user has the required organization role
 * @param roles Array of allowed roles
 */
export const requireOrgRole = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Allow all requests that use the debug token (dev/sandbox mode)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.split(' ')[1] === DEBUG_TOKEN) {
        logger.info('Bypassing org role check for debug token');
        req.orgId = (req.headers['x-organization-id'] as string) || 'debug-org';
        return next();
      }

      // Get the user from the request (set by auth middleware)
      const user = req.user;
      if (!user) {
        throw new ApiError(401, 'Unauthorized - User not authenticated');
      }

      // Get the organization ID from the request
      const orgId = req.headers['x-organization-id'] as string;
      if (!orgId) {
        throw new ApiError(400, 'Organization ID is required');
      }

      // Check if user has the required role in the organization
      const hasRole = await authService.hasOrgRole(user.id, orgId, roles);
      
      if (!hasRole) {
        throw new ApiError(403, 'Forbidden - User does not have required organization role');
      }

      // Add organization context to request
      req.orgId = orgId;
      
      next();
    } catch (error) {
      logger.error('Organization role check failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
};

// Extend Express Request type to include orgId
declare global {
  namespace Express {
    interface Request {
      orgId?: string;
    }
  }
} 