import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Format the PEM key properly for verification
function formatPemKey(key: string): string {
  if (!key) return '';
  
  // Replace literal \n with actual newlines if needed
  let formattedKey = key.replace(/\\n/g, '\n');
  
  // Remove any enclosing quotes
  formattedKey = formattedKey.replace(/^["'](.*)["']$/s, '$1');
  
  // Handle single-line keys by adding proper line breaks
  if (!formattedKey.includes('\n')) {
    formattedKey = formattedKey
      .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
      .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----');
      
    // Insert line breaks every 64 characters in the base64 part
    const matches = formattedKey.match(/-----BEGIN PUBLIC KEY-----\n(.*)\n-----END PUBLIC KEY-----/s);
    if (matches && matches[1]) {
      const formatted = matches[1].replace(/(.{64})/g, '$1\n');
      formattedKey = `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
    }
  }
  
  return formattedKey;
}

// Get PEM key from environment variables
const rawPemKey = process.env.CLERK_PEM_PUBLIC_KEY || '';
const CLERK_PEM_PUBLIC_KEY = formatPemKey(rawPemKey);
const CLERK_JWT_ISSUER = process.env.CLERK_JWT_ISSUER;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Log key information without exposing the actual key
logger.info(`PEM key available: ${!!CLERK_PEM_PUBLIC_KEY}, Length: ${CLERK_PEM_PUBLIC_KEY.length}`);
logger.info(`Using JWT issuer: ${CLERK_JWT_ISSUER || 'none (issuer validation disabled)'}`);
logger.info(`Environment: ${NODE_ENV}`);

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
      logger.info(`Attempting JWT verification with key of length ${CLERK_PEM_PUBLIC_KEY.length}`);
      
      // Create verification options
      const verifyOptions: jwt.VerifyOptions = {
        algorithms: ['RS256']
      };
      
      // Only add issuer validation if we have a valid issuer
      if (CLERK_JWT_ISSUER) {
        verifyOptions.issuer = CLERK_JWT_ISSUER;
      }
      
      // Manual JWT verification for Clerk
      const jwtVerification = jwt.verify(token, CLERK_PEM_PUBLIC_KEY, verifyOptions) as jwt.JwtPayload;
      
      if (!jwtVerification || !jwtVerification.sub) {
        logger.error('Invalid token or missing subject');
        return res.status(401).json({ 
          status: 'error', 
          message: 'Invalid token' 
        });
      }
      
      // Log successful verification
      logger.info(`JWT verified successfully - Issuer: ${jwtVerification.iss}`);
      
      const userId = jwtVerification.sub;
      
      // Get auth service instance
      const authService = AuthService.getInstance();
      
      // Get user permissions
      const permissions = await authService.getUserPermissions(userId);
      
      // Create session object
      const sessionId = jwtVerification.sid || `clerk-${Date.now()}`;
      const session = {
        userId,
        sessionId,
        status: 'active',
        lastActiveAt: Date.now(),
        expireAt: Date.now() + 86400000, // 24 hours
        abandonAt: Date.now() + 86400000 * 14, // 14 days
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Attach the session, user info, and permissions to the request
      req.session = session;
      req.user = {
        id: userId,
        sessionId,
        permissions: permissions.permissions
      };
      
      // Set req.auth as well for consistency
      req.auth = {
        userId,
        token,
        sessionId
      };

      logger.info(`Authenticated user ${userId} with session ${sessionId}`, {
        permissions: permissions.permissions
      });
      next();
    } catch (error) {
      logger.error('Authentication error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Special handling for issuer errors
      if (error instanceof Error && error.message.includes('jwt issuer invalid')) {
        logger.error(`JWT issuer mismatch. Expected: ${CLERK_JWT_ISSUER}, but token has a different issuer.`);
        logger.error('Update CLERK_JWT_ISSUER environment variable to match, or remove it to disable issuer validation.');
      }
      
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