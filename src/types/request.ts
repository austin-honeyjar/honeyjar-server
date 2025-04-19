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

export interface User {
  id: string;
  sessionId: string;
  email: string;
  permissions: string[];
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

export interface AuthRequest extends VersionedRequest {
  auth: {
    userId: string;
    token?: string;
    payload?: JwtPayload;
    sessionId?: string;
  };
} 