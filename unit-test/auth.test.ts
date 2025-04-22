import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import { ClerkAuthService } from '../src/services/auth/clerk-auth.service.js';

// Set test environment for auth service
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

async function testAuthService() {
  console.log('Starting authentication service tests...\n');
  console.log('Original environment:', originalEnv);
  console.log('Test environment:', process.env.NODE_ENV);

  // Initialize auth service using getInstance
  const authService = ClerkAuthService.getInstance();

  try {
    // First, let's get a list of admin users
    console.log('Getting list of admin users...');
    const adminUsers = await authService.getUsersWithRole('admin');
    
    if (adminUsers.length === 0) {
      console.error('No admin users found. Please ensure you have at least one admin user in your Clerk instance.');
      return;
    }

    // Use the first admin user
    const testUser = adminUsers[0];
    console.log('Using test user:', {
      id: testUser.id,
      email: testUser.email,
      name: testUser.name
    });
    console.log('✓ Found test user\n');

    // Test 1: Get User Details
    console.log('Test 1: Get User Details');
    const user = await authService.getUser(testUser.id);
    console.log('User details:', {
      id: user.id,
      email: user.email,
      name: user.name,
      permissions: user.permissions,
      roles: user.roles
    });
    console.log('✓ Test 1 completed\n');

    // Test 2: Get User Permissions
    console.log('Test 2: Get User Permissions');
    const permissions = await authService.getUserPermissions(testUser.id);
    console.log('User permissions:', permissions);
    console.log('✓ Test 2 completed\n');

    // Test 3: Check Organization Roles
    console.log('Test 3: Check Organization Roles');
    // Get the user's organization memberships
    const { data: memberships } = await clerk.users.getOrganizationMembershipList({
      userId: testUser.id
    });
    
    // Test each organization the user belongs to
    for (const membership of memberships) {
      const orgId = membership.organization.id;
      const orgName = membership.organization.name;
      console.log(`\nChecking roles in organization: ${orgName}`);
      
      const hasAdminRole = await authService.hasOrgRole(testUser.id, orgId, 'admin');
      const hasAnyRole = await authService.hasOrgRole(testUser.id, orgId, ['admin', 'basic_member']);
      
      console.log(`Has admin role in ${orgName}:`, hasAdminRole);
      console.log(`Has any role in ${orgName}:`, hasAnyRole);
    }
    console.log('✓ Test 3 completed\n');

    // Test 4: Get Users with Permission
    console.log('Test 4: Get Users with Permission');
    const usersWithPermission = await authService.getUsersWithPermission('org:feature:admin_panel');
    console.log('Users with admin_panel permission:', usersWithPermission.map(u => ({ id: u.id, email: u.email })));
    console.log('✓ Test 4 completed\n');

    // Test 5: Verify Session
    console.log('Test 5: Verify Session');
    try {
      // Get a session token for the test user
      const { data: sessions } = await clerk.sessions.getSessionList({
        userId: testUser.id
      });
      
      if (sessions.length > 0) {
        const session = sessions[0];
        const result = await authService.verifySession(session.id);
        console.log('Session verification result:', result);
      } else {
        console.log('No active sessions found for test user');
      }
    } catch (error: any) {
      console.log('Session verification failed:', error.message);
    }
    console.log('✓ Test 5 completed\n');

    // Test 6: Verify Token
    console.log('Test 6: Verify Token');
    try {
      // Get a session token for the test user
      const { data: sessions } = await clerk.sessions.getSessionList({
        userId: testUser.id
      });
      
      if (sessions.length > 0) {
        const session = sessions[0];
        console.log('Using session token:', session.id);
        const tokenResult = await authService.verifyToken(session.id);
        console.log('Token verification result:', tokenResult);
      } else {
        console.log('No active sessions found for test user');
      }
    } catch (error: any) {
      console.log('Token verification failed:', error.message);
    }
    console.log('✓ Test 6 completed\n');

    // Test 7: UI Handled Operations
    console.log('Test 7: UI Handled Operations');
    try {
      await authService.register({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });
    } catch (error: any) {
      console.log('Register error (expected):', error.message);
    }

    try {
      // Use the test user's email for login test
      console.log('\nAttempting login with:', {
        email: testUser.email,
        environment: process.env.NODE_ENV
      });
      const loginResult = await authService.login(testUser.email, 'password123');
      console.log('Login successful! Result:', {
        accessToken: loginResult.accessToken,
        refreshToken: loginResult.refreshToken,
        user: {
          id: loginResult.user.id,
          email: loginResult.user.email,
          permissions: loginResult.user.permissions
        }
      });
    } catch (error: any) {
      console.log('Login error:', error.message);
      console.log('Error details:', error);
    }

    try {
      await authService.refreshToken('test-token');
    } catch (error: any) {
      console.log('Refresh token error (expected):', error.message);
    }

    try {
      await authService.logout('test-token');
    } catch (error: any) {
      console.log('Logout error (expected):', error.message);
    }

    try {
      await authService.verifyEmail('test-token');
    } catch (error: any) {
      console.log('Verify email error (expected):', error.message);
    }

    try {
      await authService.forgotPassword('test@example.com');
    } catch (error: any) {
      console.log('Forgot password error (expected):', error.message);
    }

    try {
      await authService.resetPassword('test-token', 'new-password');
    } catch (error: any) {
      console.log('Reset password error (expected):', error.message);
    }

    try {
      await authService.changePassword(testUser.id, 'current-password', 'new-password');
    } catch (error: any) {
      console.log('Change password error (expected):', error.message);
    }
    console.log('✓ Test 7 completed\n');

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  }
}

// Run the tests
testAuthService().catch(console.error); 