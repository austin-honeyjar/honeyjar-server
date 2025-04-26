import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

// Clerk session types
export interface ClerkSession {
  userId: string;
  sessionId: string;
  status: string;
  lastActiveAt: number;
  expireAt: number;
  abandonAt: number;
  createdAt: number;
  updatedAt: number;
}

// User object from authentication middleware
export interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  sessionId?: string;
  permissions?: string[];
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      session?: ClerkSession;
      user?: User;
      auth: {
        userId: string;
        token?: string;
        payload?: JwtPayload;
        sessionId?: string;
      };
    }
  }
}

export interface VersionedRequest extends Request {
  apiVersion?: string;
}

// Request with authenticated user
export interface AuthRequest extends VersionedRequest {
  user?: User;
}

// Request with file upload
export interface FileRequest extends AuthRequest {
  file?: any; // Simplified file type to avoid dependency issues
} 