import { Request, Response, NextFunction } from 'express';
import { clerkClient } from '../config/clerk';
import { UnauthorizedError, InvalidSessionError, SessionExpiredError, ClerkError } from '../errors/appError';
import logger from '../utils/logger';
import { ClerkSession } from '../types/request';

const isDev = process.env.NODE_ENV === 'devlocal';

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
      const session = await clerkClient.sessions.getSession(token);
      
      if (!session) {
        throw new InvalidSessionError();
      }

      // Convert Clerk session to our ClerkSession type
      const clerkSession: ClerkSession = {
        userId: session.userId,
        sessionId: session.id,
        status: session.status,
        lastActiveAt: new Date(session.lastActiveAt).getTime(),
        expireAt: new Date(session.expireAt).getTime(),
        abandonAt: new Date(session.abandonAt).getTime(),
        createdAt: new Date(session.createdAt).getTime(),
        updatedAt: new Date(session.updatedAt).getTime()
      };

      // Check if session is expired
      if (clerkSession.expireAt < Date.now()) {
        throw new SessionExpiredError();
      }

      // Attach the session and user info to the request
      req.session = clerkSession;
      req.user = {
        id: clerkSession.userId,
        sessionId: clerkSession.sessionId
      };

      logger.info(`Authenticated user ${clerkSession.userId} with session ${clerkSession.sessionId}`);
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