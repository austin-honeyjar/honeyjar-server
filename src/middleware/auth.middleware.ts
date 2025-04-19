import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import logger from '../utils/logger';

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