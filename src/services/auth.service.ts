import { createClerkClient } from '@clerk/backend';
import { verifyToken } from '@clerk/backend';
import logger from '../utils/logger';
import { ClerkSession } from '../types/request';
import { UnauthorizedError, ForbiddenError } from '../errors/appError';
import { ApiError } from '../utils/error';
import type { User } from '@clerk/backend';

export interface UserPermissions {
  permissions: string[];
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface OrganizationMembership {
  id: string;
  role: string;
  permissions: string[];
}

export class AuthService {
  private static instance: AuthService;
  private sessionCache: Map<string, { session: ClerkSession; expiresAt: number }>;
  private permissionCache: Map<string, { permissions: UserPermissions; expiresAt: number }>;
  private clerk: ReturnType<typeof createClerkClient>;

  private constructor() {
    this.sessionCache = new Map();
    this.permissionCache = new Map();
    this.clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY
    });
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async verifySession(token: string): Promise<ClerkSession> {
    try {
      // Verify the token with Clerk
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });

      if (!payload) {
        throw new Error('Invalid token');
      }

      // Check cache first
      const cachedSession = this.sessionCache.get(payload.sid);
      if (cachedSession && cachedSession.expiresAt > Date.now()) {
        logger.info('Using cached session');
        return cachedSession.session;
      }

      // Get fresh session from Clerk
      const session = await this.clerk.sessions.getSession(payload.sid);
      
      if (!session) {
        throw new Error('Session not found');
      }

      // Convert to our ClerkSession type
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

      // Cache the session
      this.sessionCache.set(payload.sid, {
        session: clerkSession,
        expiresAt: Date.now() + 5 * 60 * 1000 // Cache for 5 minutes
      });

      return clerkSession;
    } catch (error) {
      logger.error('Error verifying session:', error);
      throw error;
    }
  }

  /**
   * Get user permissions from Clerk
   * @param userId The user's Clerk ID
   * @returns User permissions and basic info
   */
  public async getUserPermissions(userId: string): Promise<UserPermissions> {
    try {
      // Check permission cache first
      const cachedPermissions = this.permissionCache.get(userId);
      if (cachedPermissions && cachedPermissions.expiresAt > Date.now()) {
        logger.info('Using cached permissions');
        return cachedPermissions.permissions;
      }

      logger.info('Getting user permissions for user:', { userId });
      
      let user;
      try {
        user = await this.clerk.users.getUser(userId);
        logger.info('Got user from Clerk:', { userId: user?.id });
      } catch (error) {
        logger.error('Error getting user from Clerk:', {
          error,
          userId,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        throw new UnauthorizedError('Failed to get user from Clerk');
      }
      
      if (!user) {
        logger.error('User not found in Clerk:', { userId });
        throw new UnauthorizedError('User not found');
      }

      // Get all organization memberships for the user
      logger.info('Getting organization memberships for user:', { userId });
      try {
        // Get all organizations the user is a member of
        const memberships = await this.clerk.users.getOrganizationMembershipList({
          userId: userId
        });
        
        logger.info('Got organization memberships:', {
          userId,
          count: memberships.data.length,
          memberships: memberships.data.map(m => ({
            id: m.id,
            role: m.role,
            permissions: m.permissions
          }))
        });
        
        // Get all unique permissions from all memberships
        const permissions = new Set<string>();
        
        // Add default permissions for all users
        permissions.add('user:read');
        permissions.add('user:write');
        
        // Add permissions from organization memberships
        memberships.data.forEach(membership => {
          if (membership.permissions) {
            membership.permissions.forEach(permission => permissions.add(permission));
          }
        });
        
        const userPermissions: UserPermissions = {
          permissions: Array.from(permissions),
          userId: user.id,
          email: user.emailAddresses[0]?.emailAddress || '',
          firstName: user.firstName,
          lastName: user.lastName
        };

        // Cache the permissions
        this.permissionCache.set(userId, {
          permissions: userPermissions,
          expiresAt: Date.now() + 5 * 60 * 1000 // Cache for 5 minutes
        });

        logger.info('Got organization permissions:', { 
          userId,
          permissions: userPermissions.permissions
        });
        
        return userPermissions;
      } catch (error) {
        logger.error('Error getting organization memberships:', {
          error,
          userId,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        
        // Return default permissions if we can't get organization memberships
        const defaultPermissions: UserPermissions = {
          permissions: ['user:read', 'user:write'],
          userId: user.id,
          email: user.emailAddresses[0]?.emailAddress || '',
          firstName: user.firstName,
          lastName: user.lastName
        };

        // Cache the default permissions
        this.permissionCache.set(userId, {
          permissions: defaultPermissions,
          expiresAt: Date.now() + 5 * 60 * 1000 // Cache for 5 minutes
        });

        return defaultPermissions;
      }
    } catch (error) {
      logger.error('Error in getUserPermissions:', {
        error,
        userId,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Check if user has a specific permission
   * @param userId The user's Clerk ID
   * @param permission The permission to check
   * @returns True if user has the permission
   */
  public async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      return userPermissions.permissions.includes(permission);
    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Verify that a user has a specific permission
   * @param userId The user's Clerk ID
   * @param permission The permission to verify
   * @throws ForbiddenError if user doesn't have the permission
   */
  public async verifyPermission(userId: string, permission: string): Promise<void> {
    const hasPermission = await this.hasPermission(userId, permission);
    if (!hasPermission) {
      throw new ForbiddenError(`Permission '${permission}' required`);
    }
  }

  /**
   * Get all users with a specific permission
   * @param permission The permission to check
   * @returns Array of users with the permission
   */
  public async getUsersWithPermission(permission: string): Promise<UserPermissions[]> {
    try {
      const response = await this.clerk.users.getUserList();
      const usersWithPermission: UserPermissions[] = [];

      // Process each user in the response
      for (const user of response.data) {
        const permissions = user.publicMetadata?.permissions as string[] || [];
        if (permissions.includes(permission)) {
          usersWithPermission.push({
            permissions,
            userId: user.id,
            email: user.emailAddresses[0]?.emailAddress || '',
            firstName: user.firstName,
            lastName: user.lastName
          });
        }
      }

      return usersWithPermission;
    } catch (error) {
      logger.error('Error getting users with permission:', error);
      throw new UnauthorizedError('Failed to get users with permission');
    }
  }

  public async validateSession(session: ClerkSession): Promise<boolean> {
    try {
      // Check if session is expired
      if (session.expireAt < Date.now()) {
        return false;
      }

      // Verify session is still valid with Clerk
      const clerkSession = await this.clerk.sessions.getSession(session.sessionId);
      return clerkSession?.status === 'active';
    } catch (error) {
      logger.error('Error validating session:', error);
      return false;
    }
  }

  async login(email: string, password: string) {
    try {
      // First, try to get the user by email
      const { data: users } = await this.clerk.users.getUserList({
        emailAddress: [email]
      });

      const user = users[0];
      if (!user) {
        throw new ApiError(401, 'Invalid credentials');
      }

      // Get user permissions
      const permissions = await this.getUserPermissions(user.id);

      // Generate a session token
      const token = await verifyToken(user.id, {
        secretKey: process.env.CLERK_SECRET_KEY
      });

      if (!token) {
        throw new ApiError(401, 'Failed to create session');
      }

      logger.info('User logged in successfully', {
        userId: user.id,
        permissions: permissions.permissions
      });

      return {
        token: token.sid,
        user: {
          id: user.id,
          email,
          permissions: permissions.permissions
        }
      };
    } catch (error) {
      logger.error('Login error:', { error });
      throw new ApiError(401, 'Invalid credentials');
    }
  }

  /**
   * Check if a user has a specific role in an organization
   * @param userId The user's Clerk ID
   * @param orgId The organization ID
   * @param roles The roles to check, can be a single role or an array of roles
   * @returns True if user has any of the specified roles
   */
  public async hasOrgRole(userId: string, orgId: string, roles: string[]): Promise<boolean> {
    try {
      logger.info('Checking organization role', { userId, orgId, roles });
      
      // First check if user has system-level permissions
      let user;
      try {
        user = await this.clerk.users.getUser(userId);
        logger.info('Retrieved user', { userId, hasMetadata: !!user.publicMetadata });
      } catch (error) {
        logger.error('Error getting user from Clerk:', { error, userId });
        return false;
      }
      
      const metadata = user.publicMetadata as Record<string, any>;
      const hasSystemPermissions = metadata?.permissions?.includes('org:sys_memberships:manage') || 
                               metadata?.permissions?.includes('org:sys_memberships:read');
      
      if (hasSystemPermissions) {
        logger.info('User has system-level permissions, allowing access', { userId, orgId });
        return true;
      }

      // If no system permissions, check organization role
      try {
        // Get the user's organization memberships
        const { data: memberships } = await this.clerk.users.getOrganizationMembershipList({
          userId,
        });

        logger.info('Retrieved organization memberships', { 
          userId, 
          orgId, 
          membershipCount: memberships?.length 
        });

        // Find the membership for the specified organization
        const membership = memberships.find((m: any) => m.organization.id === orgId);
        
        if (!membership) {
          logger.info('User is not a member of the organization', { userId, orgId });
          return false;
        }

        // Check if the user's role is in the allowed roles
        // Clerk uses org: prefix for roles, so we need to check both with and without prefix
        const userRole = membership.role;
        // Convert roles to array if it's a string
        const rolesArray = Array.isArray(roles) ? roles : [roles];
        
        const hasRole = rolesArray.some(role => 
          role === userRole || 
          role === userRole.replace('org:', '') || 
          `org:${role}` === userRole
        );

        logger.info('Role check result', { userId, orgId, userRole, roles: rolesArray, hasRole });
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

  /**
   * Get user details
   * @param userId The user's Clerk ID
   * @returns User object with id, email, name, and permissions
   */
  public async getUser(userId: string): Promise<{ id: string; email: string; name: string; permissions: string[] }> {
    try {
      logger.info('Getting user details', { userId });
      
      let user;
      try {
        user = await this.clerk.users.getUser(userId);
        logger.info('Got user from Clerk:', { userId: user?.id });
      } catch (error) {
        logger.error('Error getting user from Clerk:', { error, userId });
        throw new Error('Failed to get user from Clerk');
      }
      
      if (!user) {
        logger.error('User not found in Clerk:', { userId });
        throw new Error('User not found');
      }
      
      // Get user email
      const email = user.emailAddresses[0]?.emailAddress || '';
      
      // Get user name
      const firstName = user.firstName || '';
      const lastName = user.lastName || '';
      const name = `${firstName} ${lastName}`.trim();
      
      // Get user permissions
      const metadata = user.publicMetadata as Record<string, any>;
      const permissions = metadata?.permissions || [];
      
      return {
        id: user.id,
        email,
        name,
        permissions
      };
    } catch (error) {
      logger.error('Error in getUser:', { error, userId });
      throw error;
    }
  }

  /**
   * Get all users with a specific role
   * @param role The role to check for
   * @returns Array of users with the role
   */
  public async getUsersWithRole(role: string): Promise<Array<{ id: string; email: string; name: string }>> {
    try {
      logger.info('Getting users with role', { role });
      
      const response = await this.clerk.users.getUserList();
      const usersWithRole: Array<{ id: string; email: string; name: string }> = [];
      
      // Process each user in the response
      for (const user of response.data) {
        // Get the user's organization memberships to check roles
        try {
          const { data: memberships } = await this.clerk.users.getOrganizationMembershipList({
            userId: user.id
          });
          
          // Check if the user has the role in any organization
          const hasRole = memberships.some(membership => 
            membership.role === role || 
            membership.role === `org:${role}` || 
            membership.role.replace('org:', '') === role
          );
          
          if (hasRole) {
            usersWithRole.push({
              id: user.id,
              email: user.emailAddresses[0]?.emailAddress || '',
              name: `${user.firstName || ''} ${user.lastName || ''}`.trim()
            });
          }
        } catch (error) {
          logger.error('Error getting organization memberships:', { error, userId: user.id });
          // Skip this user
          continue;
        }
      }
      
      return usersWithRole;
    } catch (error) {
      logger.error('Error getting users with role:', { error });
      throw error;
    }
  }
} 