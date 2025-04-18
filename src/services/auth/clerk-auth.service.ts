import { createClerkClient } from '@clerk/backend';
import { AuthService, User, UserPermissions, AuthResponse, TokenResponse } from './auth.types';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

export class ClerkAuthService implements AuthService {
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
    // Clerk handles authentication through their UI
    throw new Error('Authentication is handled through Clerk UI');
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
    const user = await clerk.users.getUser(userId);
    const { data: memberships } = await clerk.users.getOrganizationMembershipList({
      userId: user.id
    });

    // Get all roles from organization memberships
    const orgRoles = memberships.map((m: any) => m.role.replace('org:', ''));
    const isAdmin = orgRoles.includes('admin');

    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || '',
      name: `${user.firstName} ${user.lastName}`,
      permissions: isAdmin ? ['admin_panel'] : [],
      roles: orgRoles
    };
  }

  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const user = await clerk.users.getUser(userId);
    const { data: memberships } = await clerk.users.getOrganizationMembershipList({
      userId: user.id
    });

    // Get all roles from organization memberships
    const orgRoles = memberships.map((m: any) => m.role.replace('org:', ''));
    const isAdmin = orgRoles.includes('admin');

    return {
      permissions: isAdmin ? ['admin_panel'] : [],
      roles: orgRoles
    };
  }

  async getUsersWithPermission(permission: string): Promise<User[]> {
    const { data: users } = await clerk.users.getUserList();
    const usersWithPermission: User[] = [];

    for (const user of users) {
      try {
        const { data: memberships } = await clerk.users.getOrganizationMembershipList({
          userId: user.id
        });

        const orgRoles = memberships.map((m: any) => m.role.replace('org:', ''));
        const isAdmin = orgRoles.includes('admin');

        if ((permission === 'admin_panel' && isAdmin) || 
            (user.publicMetadata.permissions as string[] || []).includes(permission)) {
          usersWithPermission.push({
            id: user.id,
            email: user.emailAddresses[0]?.emailAddress || '',
            name: `${user.firstName} ${user.lastName}`,
            permissions: isAdmin ? ['admin_panel'] : [],
            roles: orgRoles
          });
        }
      } catch (error) {
        console.error(`Error checking permissions for user ${user.id}:`, error);
      }
    }

    return usersWithPermission;
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
      const session = await clerk.sessions.verifySession(token, token);
      return { isValid: true, userId: session.userId };
    } catch (error) {
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