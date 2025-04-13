import { Request, Response, NextFunction } from 'express';
import { clerkClient } from '../config/clerk.js';
import { UnauthorizedError, InvalidSessionError, SessionExpiredError, ClerkError } from '../errors/appError.js';
import logger from '../utils/logger.js';
import { ClerkSession } from '../types/request.js';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedError('No authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    try {
      // Verify the session token with Clerk
      const session = await clerkClient.verifySession(token) as ClerkSession;
      
      if (!session) {
        throw new InvalidSessionError();
      }

      // Check if session is expired
      if (session.expireAt < Date.now()) {
        throw new SessionExpiredError();
      }

      // Attach the session and user info to the request
      req.session = session;
      req.user = {
        id: session.userId,
        sessionId: session.sessionId
      };

      logger.info(`Authenticated user ${session.userId} with session ${session.sessionId}`);
      next();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new ClerkError(error instanceof Error ? error.message : 'Unknown Clerk error');
    }
  } catch (error) {
    logger.error('Authentication error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    next(error);
  }
}; 