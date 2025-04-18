import { createClerkClient } from '@clerk/backend';
import type { OrganizationMembership } from '@clerk/backend';
import { AuthService } from './auth.types.js';
import logger from '../../utils/logger.js';

export class ClerkAuthService implements AuthService {
  private clerkClient: ReturnType<typeof createClerkClient>;

  constructor() {
    this.clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  }

  async verifyToken(token: string): Promise<{ isValid: boolean; userId?: string }> {
    try {
      const session = await this.clerkClient.sessions.verifySession(token, '');
      return { isValid: true, userId: session.userId };
    } catch (error) {
      logger.error('Token verification failed', { error });
      throw error;
    }
  }

  async hasOrgRole(userId: string, orgId: string, roles: string[]): Promise<boolean> {
    try {
      // Get the user's organization memberships
      const { data: memberships } = await this.clerkClient.users.getOrganizationMembershipList({
        userId,
      });

      // Find the membership for the specified organization
      const membership = memberships.find((m: OrganizationMembership) => m.organization.id === orgId);
      
      if (!membership) {
        return false;
      }

      // Check if the user's role is in the allowed roles
      return roles.includes(membership.role);
    } catch (error) {
      logger.error('Organization role check failed', { error, userId, orgId, roles });
      return false;
    }
  }
}

// Create a singleton instance of the auth service
const authService: AuthService = new ClerkAuthService();

export { authService }; 