export interface User {
  id: string;
  email: string;
  name: string;
  permissions: string[];
  roles: string[];
}

export interface UserPermissions {
  permissions: string[];
  roles: string[];
}

export interface AuthResponse {
  id: string;
  email: string;
  name: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthService {
  register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<AuthResponse>;

  login(email: string, password: string): Promise<TokenResponse>;

  refreshToken(refreshToken: string): Promise<TokenResponse>;

  logout(token: string): Promise<void>;

  verifyEmail(token: string): Promise<void>;

  forgotPassword(email: string): Promise<void>;

  resetPassword(token: string, newPassword: string): Promise<void>;

  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;

  getUser(userId: string): Promise<User>;

  getUserPermissions(userId: string): Promise<UserPermissions>;

  getUsersWithPermission(permission: string): Promise<User[]>;

  verifyToken(token: string): Promise<{ isValid: boolean; userId?: string }>;

  hasOrgRole(userId: string, orgId: string, roles: string | string[]): Promise<boolean>;
} 