import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import logger from '../utils/logger';

// Debug token for development/testing
const DEBUG_TOKEN = 'debug-auth-123456';
const DEBUG_USER_ID = 'debug-user-123';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logger.error('No authorization header');
      return res.status(401).json({ 
        status: 'error', 
        message: 'No authorization header' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      logger.error('No token provided');
      return res.status(401).json({ 
        status: 'error', 
        message: 'No token provided' 
      });
    }

    logger.info('Auth middleware - Token received:', {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 10) + '...',
      path: req.path,
      method: req.method
    });

    // Check if using debug token
    if (token === DEBUG_TOKEN) {
      logger.info('Using debug token for authentication');
      
      // Create mock session and user info
      req.session = {
        userId: DEBUG_USER_ID,
        sessionId: 'debug-session-id',
        status: 'active',
        lastActiveAt: Date.now(),
        expireAt: Date.now() + 86400000, // 24 hours
        abandonAt: Date.now() + 86400000 * 14, // 14 days
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      req.user = {
        id: DEBUG_USER_ID,
        sessionId: 'debug-session-id',
        permissions: ['user:read', 'user:write', 'org:read', 'org:write', 'asset:read', 'asset:write']
      };
      
      // Set req.auth as well for compatibility
      req.auth = {
        userId: DEBUG_USER_ID,
        token: DEBUG_TOKEN,
        sessionId: 'debug-session-id'
      };
      
      logger.info(`Authenticated using debug token as user ${DEBUG_USER_ID}`);
      return next();
    }

    try {
      // Get auth service instance
      const authService = AuthService.getInstance();

      // Verify session and get session details
      const session = await authService.verifySession(token);
      
      // Get user permissions
      const permissions = await authService.getUserPermissions(session.userId);

      // Attach the session, user info, and permissions to the request
      req.session = session;
      req.user = {
        id: session.userId,
        sessionId: session.sessionId,
        permissions: permissions.permissions
      };
      
      // Set req.auth as well for consistency
      req.auth = {
        userId: session.userId,
        token: token,
        sessionId: session.sessionId
      };

      logger.info(`Authenticated user ${session.userId} with session ${session.sessionId}`, {
        permissions: permissions.permissions
      });
      next();
    } catch (error) {
      logger.error('Authentication error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return res.status(401).json({ 
        status: 'error', 
        message: 'Authentication failed' 
      });
    }
  } catch (error) {
    logger.error('Authentication error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error' 
    });
  }
}; 