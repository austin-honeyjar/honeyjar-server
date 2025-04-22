import { createClerkClient } from '@clerk/backend';
import type { OrganizationMembership } from '@clerk/backend';
import { AuthService, UserPermissions, User, AuthResponse, TokenResponse } from './auth.types.js';
import logger from '../../utils/logger.js';

interface UserMetadata {
  permissions?: string[];
}

export class ClerkAuthService implements AuthService {
  private static instance: ClerkAuthService;
  private clerkClient: ReturnType<typeof createClerkClient>;

  private constructor() {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    if (!secretKey) {
      logger.error('CLERK_SECRET_KEY is not set');
      throw new Error('CLERK_SECRET_KEY is required');
    }

    if (!publishableKey) {
      logger.error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set');
      throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required');
    }

    this.clerkClient = createClerkClient({
      secretKey,
      publishableKey,
    });

    logger.info('Clerk client initialized', { 
      hasSecretKey: !!secretKey,
      hasPublishableKey: !!publishableKey
    });
  }

  public static getInstance(): ClerkAuthService {
    if (!ClerkAuthService.instance) {
      ClerkAuthService.instance = new ClerkAuthService();
    }
    return ClerkAuthService.instance;
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
      logger.info('Checking organization role', { userId, orgId, roles });
      
      // First check if user has system-level permissions
      const user = await this.clerkClient.users.getUser(userId);
      logger.info('Retrieved user', { userId, hasMetadata: !!user.publicMetadata });
      
      const metadata = user.publicMetadata as UserMetadata;
      const hasSystemPermissions = metadata?.permissions?.includes('org:sys_memberships:manage') || 
                                 metadata?.permissions?.includes('org:sys_memberships:read');
      
      if (hasSystemPermissions) {
        logger.info('User has system-level permissions, allowing access', { userId, orgId });
        return true;
      }

      // If no system permissions, check organization role
      try {
        // Get the user's organization memberships
        const { data: memberships } = await this.clerkClient.users.getOrganizationMembershipList({
          userId,
        });

        logger.info('Retrieved organization memberships', { 
          userId, 
          orgId, 
          membershipCount: memberships?.length 
        });

        // Find the membership for the specified organization
        const membership = memberships.find((m: OrganizationMembership) => m.organization.id === orgId);
        
        if (!membership) {
          logger.info('User is not a member of the organization', { userId, orgId });
          return false;
        }

        // Check if the user's role is in the allowed roles
        // Clerk uses org: prefix for roles, so we need to check both with and without prefix
        const userRole = membership.role;
        const hasRole = roles.some(role => 
          role === userRole || 
          role === userRole.replace('org:', '') || 
          `org:${role}` === userRole
        );

        logger.info('Role check result', { userId, orgId, userRole, roles, hasRole });
        return hasRole;
      } catch (error) {
        logger.error('Error checking organization role', { error, userId, orgId });
        return false;
      }
    } catch (error) {
      logger.error('Error in hasOrgRole', { error, userId, orgId });
      return false;
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      logger.info('Getting user permissions', { userId });
      
      // Get user metadata
      const user = await this.clerkClient.users.getUser(userId);
      const metadata = user.publicMetadata as UserMetadata;
      return metadata?.permissions || [];
    } catch (error) {
      logger.error('Error getting user permissions', { error, userId });
      return [];
    }
  }

  // Required by AuthService interface but not implemented
  async register(data: { email: string; password: string; firstName: string; lastName: string; }): Promise<AuthResponse> {
    throw new Error('Method not implemented.');
  }

  async login(email: string, password: string): Promise<TokenResponse> {
    throw new Error('Method not implemented.');
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    throw new Error('Method not implemented.');
  }

  async logout(token: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async verifyEmail(token: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async forgotPassword(email: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async getUser(userId: string): Promise<User> {
    throw new Error('Method not implemented.');
  }

  async getUsersWithPermission(permission: string): Promise<User[]> {
    throw new Error('Method not implemented.');
  }
}

// Create a singleton instance of the auth service
const authService: AuthService = ClerkAuthService.getInstance();

export { authService }; 