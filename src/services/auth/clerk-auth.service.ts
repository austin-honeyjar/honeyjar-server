import { createClerkClient } from '@clerk/backend';
import { AuthService, User, UserPermissions, AuthResponse, TokenResponse } from './auth.types';
import logger from '../../utils/logger';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

export class ClerkAuthService implements AuthService {
  private static instance: ClerkAuthService;

  private constructor() {}

  public static getInstance(): ClerkAuthService {
    if (!ClerkAuthService.instance) {
      ClerkAuthService.instance = new ClerkAuthService();
    }
    return ClerkAuthService.instance;
  }

  async verifySession(token: string): Promise<{ userId: string; sessionId: string }> {
    try {
      const session = await clerk.sessions.getSession(token);
      
      if (!session || !session.userId) {
        throw new Error('Invalid token');
      }

      return {
        userId: session.userId,
        sessionId: session.id
      };
    } catch (error) {
      logger.error('Token verification failed:', error);
      throw new Error('Invalid token');
    }
  }

  async getUserPermissions(userId: string): Promise<UserPermissions> {
    try {
      const user = await clerk.users.getUser(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      // Get organization memberships
      const { data: memberships } = await clerk.users.getOrganizationMembershipList({
        userId
      });

      logger.info('User memberships:', {
        userId,
        memberships: memberships.map(m => ({
          orgId: m.organization.id,
          role: m.role
        }))
      });

      // Extract permissions from memberships
      const permissions = new Set<string>();
      const roles = new Set<string>();
      
      // Add base user permissions
      permissions.add('user:read');
      permissions.add('user:write');

      // Add organization permissions based on role
      for (const membership of memberships) {
        const role = membership.role;
        // Store the full role name (e.g., org:admin)
        roles.add(role);
        
        // Add role-specific permissions
        if (role === 'org:admin') {
          permissions.add('org:sys_domains:manage');
          permissions.add('org:sys_domains:read');
          permissions.add('org:sys_memberships:manage');
          permissions.add('org:sys_memberships:read');
          permissions.add('org:sys_profile:manage');
          permissions.add('org:sys_billing:read');
          permissions.add('org:sys_billing:manage');
          permissions.add('org:feature:admin_panel');
        } else if (role === 'org:basic_member') {
          permissions.add('org:sys_domains:read');
          permissions.add('org:sys_memberships:read');
        }
      }

      const result = {
        permissions: Array.from(permissions),
        roles: Array.from(roles)
      };

      logger.info('User permissions:', {
        userId,
        permissions: result.permissions,
        roles: result.roles
      });

      return result;
    } catch (error) {
      logger.error('Failed to get user permissions:', error);
      throw new Error('Failed to get user permissions');
    }
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<AuthResponse> {
    // Clerk handles user registration through their UI
    throw new Error('User registration is handled through Clerk UI');
  }

  async login(email: string, password: string): Promise<TokenResponse> {
    try {
      // First, try to get the user by email
      const { data: users } = await clerk.users.getUserList({
        emailAddress: [email]
      });

      const user = users[0];
      if (!user) {
        logger.info('Login failed: User not found', { email });
        throw new Error('Invalid credentials');
      }

      // For test purposes, allow login with any password
      if (process.env.NODE_ENV === 'test') {
        logger.info('Test environment: Skipping password verification');
        // Get user permissions
        const permissions = await this.getUserPermissions(user.id);

        return {
          accessToken: user.id,
          refreshToken: user.id, // Clerk handles refresh tokens internally
          user: {
            id: user.id,
            email,
            permissions: permissions.permissions
          }
        };
      }

      // In production, we can't verify passwords directly with Clerk's backend API
      // This is handled by Clerk's UI components
      logger.info('Password verification is handled by Clerk UI');
      throw new Error('Password verification is handled by Clerk UI');
    } catch (error) {
      logger.error('Login failed:', error);
      throw new Error('Login failed');
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    // Clerk handles token refresh automatically
    throw new Error('Token refresh is handled automatically by Clerk');
  }

  async logout(token: string): Promise<void> {
    // Clerk handles logout through their UI
    throw new Error('Logout is handled through Clerk UI');
  }

  async verifyEmail(token: string): Promise<void> {
    // Clerk handles email verification through their UI
    throw new Error('Email verification is handled through Clerk UI');
  }

  async forgotPassword(email: string): Promise<void> {
    // Clerk handles password reset through their UI
    throw new Error('Password reset is handled through Clerk UI');
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Clerk handles password reset through their UI
    throw new Error('Password reset is handled through Clerk UI');
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Clerk handles password change through their UI
    throw new Error('Password change is handled through Clerk UI');
  }

  async getUser(userId: string): Promise<User> {
    try {
      const user = await clerk.users.getUser(userId);
      const permissions = await this.getUserPermissions(userId);
      
      return {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress || '',
        name: `${user.firstName} ${user.lastName}`,
        permissions: permissions.permissions,
        roles: permissions.roles || []
      };
    } catch (error) {
      logger.error('Failed to get user:', error);
      throw new Error('Failed to get user');
    }
  }

  async getUsersWithPermission(permission: string): Promise<User[]> {
    try {
      const { data: users } = await clerk.users.getUserList();
      const usersWithPermission: User[] = [];

      logger.info('Checking permission:', { permission });

      for (const user of users) {
        try {
          const permissions = await this.getUserPermissions(user.id);
          
          logger.info('User permissions check:', {
            userId: user.id,
            email: user.emailAddresses[0]?.emailAddress,
            hasPermission: permissions.permissions.includes(permission),
            isAdmin: permissions.roles?.includes('org:admin'),
            allPermissions: permissions.permissions
          });

          // Check both direct permissions and role-based permissions
          if (permissions.permissions.includes(permission) || 
              (permission === 'org:feature:admin_panel' && permissions.roles?.includes('org:admin'))) {
            usersWithPermission.push({
              id: user.id,
              email: user.emailAddresses[0]?.emailAddress || '',
              name: `${user.firstName} ${user.lastName}`,
              permissions: permissions.permissions,
              roles: permissions.roles || []
            });
          }
        } catch (error) {
          logger.error(`Error checking permissions for user ${user.id}:`, error);
        }
      }

      logger.info('Found users with permission:', {
        permission,
        count: usersWithPermission.length,
        users: usersWithPermission.map(u => ({ id: u.id, email: u.email }))
      });

      return usersWithPermission;
    } catch (error) {
      logger.error('Failed to get users with permission:', error);
      throw new Error('Failed to get users with permission');
    }
  }

  async getUsersWithRole(role: string): Promise<User[]> {
    const { data: users } = await clerk.users.getUserList();
    const adminUsers: User[] = [];

    console.log(`Found ${users.length} total users`);

    for (const user of users) {
      try {
        console.log(`\nChecking user: ${user.emailAddresses[0]?.emailAddress}`);
        
        // Get organization memberships for each user
        const { data: memberships } = await clerk.users.getOrganizationMembershipList({
          userId: user.id
        });

        // Log organization names for this user
        const orgNames = memberships.map((m: any) => m.organization.name).join(', ');
        console.log(`Organizations: ${orgNames}`);

        // Check if user has the admin role in any organization
        const isAdmin = memberships.some((membership: any) => {
          console.log(`Checking membership role: ${membership.role}`);
          return membership.role === 'org:admin';
        });

        if (isAdmin) {
          console.log('Found admin user!');
          adminUsers.push({
            id: user.id,
            email: user.emailAddresses[0]?.emailAddress || '',
            name: `${user.firstName} ${user.lastName}`,
            permissions: user.publicMetadata.permissions as string[] || [],
            roles: user.publicMetadata.roles as string[] || []
          });
        }
      } catch (error) {
        console.error(`Error fetching memberships for user ${user.id}:`, error);
      }
    }

    console.log(`\nFound ${adminUsers.length} admin users`);
    return adminUsers;
  }

  async verifyToken(token: string): Promise<{ isValid: boolean; userId?: string }> {
    try {
      const session = await clerk.sessions.getSession(token);
      if (!session || !session.userId) {
        return { isValid: false };
      }
      return { isValid: true, userId: session.userId };
    } catch (error) {
      logger.error('Token verification failed:', error);
      return { isValid: false };
    }
  }

  async hasOrgRole(userId: string, orgId: string, roles: string | string[]): Promise<boolean> {
    const { data: memberships } = await clerk.users.getOrganizationMembershipList({
      userId
    });

    const roleArray = Array.isArray(roles) ? roles : [roles];
    return memberships.some((membership: any) => 
      membership.organization.id === orgId && 
      roleArray.some(role => membership.role === `org:${role}`)
    );
  }
} 