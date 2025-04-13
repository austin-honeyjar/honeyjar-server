import { Request } from 'express';

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

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        sessionId: string;
      };
      session?: ClerkSession;
    }
  }
} 