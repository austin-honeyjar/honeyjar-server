import { clerkClient } from '../config/clerk';
import { ForbiddenError, UnauthorizedError } from '../errors/appError';
import logger from '../utils/logger';

export interface UserPermissions {
  permissions: string[];
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Get user permissions from Clerk
   * @param userId The user's Clerk ID
   * @returns User permissions and basic info
   */
  public async getUserPermissions(userId: string): Promise<UserPermissions> {
    try {
      const user = await clerkClient.users.getUser(userId);
      
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      const permissions = user.publicMetadata?.permissions as string[] || [];
      
      return {
        permissions,
        userId: user.id,
        email: user.emailAddresses[0]?.emailAddress || '',
        firstName: user.firstName,
        lastName: user.lastName
      };
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      throw new UnauthorizedError('Failed to get user permissions');
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
      const response = await clerkClient.users.getUserList();
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
} 