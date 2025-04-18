import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import { ClerkAuthService } from '../src/services/auth/clerk-auth.service.js';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
});

async function testAuthService() {
  console.log('Starting authentication service tests...\n');

  // Initialize auth service
  const authService = new ClerkAuthService();

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
      const hasAnyRole = await authService.hasOrgRole(testUser.id, orgId, ['admin', 'editor']);
      
      console.log(`Has admin role in ${orgName}:`, hasAdminRole);
      console.log(`Has any role in ${orgName}:`, hasAnyRole);
    }
    console.log('✓ Test 3 completed\n');

    // Test 4: Get Users with Permission
    console.log('Test 4: Get Users with Permission');
    const usersWithPermission = await authService.getUsersWithPermission('admin_panel');
    console.log('Users with admin_panel permission:', usersWithPermission.map(u => ({ id: u.id, email: u.email })));
    console.log('✓ Test 4 completed\n');

    // Test 5: Verify Token
    console.log('Test 5: Verify Token');
    // Note: This will fail as we don't have a valid token
    try {
      const tokenResult = await authService.verifyToken('test-token');
      console.log('Token verification result:', tokenResult);
    } catch (error: any) {
      console.log('Token verification failed (expected):', error.message);
    }
    console.log('✓ Test 5 completed\n');

    // Test 6: UI Handled Operations
    console.log('Test 6: UI Handled Operations');
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
      await authService.login('test@example.com', 'password123');
    } catch (error: any) {
      console.log('Login error (expected):', error.message);
    }

    try {
      await authService.logout('token');
    } catch (error: any) {
      console.log('Logout error (expected):', error.message);
    }
    console.log('✓ Test 6 completed\n');

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
testAuthService().catch(console.error); 