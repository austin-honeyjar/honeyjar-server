import { createClerkClient } from '@clerk/backend';
import logger from '../utils/logger';

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY is not defined in environment variables');
}

// Initialize Clerk client
export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  // Add error handling
}); 