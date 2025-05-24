import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireOrgRole } from '../middleware/org.middleware';
import { validate } from '../middleware/validation.middleware';
import { 
  loginSchema, 
  registerSchema, 
  refreshTokenSchema,
  changePasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema
} from '../validators/auth.validator';
import logger from '../utils/logger';
import { AuthService } from '../services/auth.service';
import { AuthRequest } from '../types/request';
import { ApiError } from '../utils/error';

const router = Router();

// Apply logging middleware to all routes
router.use((req, res, next) => {
  logger.info('Incoming auth request', {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with Clerk session token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Clerk session token
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: Access token for authentication
 *                 refreshToken:
 *                   type: string
 *                   description: Refresh token for getting new access tokens
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: User ID
 *                     email:
 *                       type: string
 *                       description: User's email
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: User's permissions
 *       401:
 *         description: Invalid token
 *       500:
 *         description: Server error
 */
router.post('/login', async (req: AuthRequest, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Token is required'
      });
    }

    const authService = AuthService.getInstance();
    const session = await authService.verifySession(token);

    if (!session) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }

    // Get user permissions
    const userPermissions = await authService.getUserPermissions(session.userId);
    
    // Handle both the old and new format
    let permissionsArray: string[] = [];
    let userEmail = '';
    
    if (Array.isArray(userPermissions)) {
      permissionsArray = userPermissions;
      
      // If we don't have the email from permissions, try to get it from the user
      try {
        const user = await authService.getUser(session.userId);
        userEmail = user.email;
      } catch (error) {
        logger.warn('Could not get user email', { error });
      }
    } else {
      // Old format
      permissionsArray = userPermissions.permissions || [];
      userEmail = userPermissions.email || '';
    }

    logger.info('User logged in successfully', {
      userId: session.userId,
      permissions: permissionsArray
    });

    res.json({
      accessToken: token,
      refreshToken: token, // Clerk handles refresh tokens internally
      user: {
        id: session.userId,
        email: userEmail,
        permissions: permissionsArray
      }
    });
  } catch (error) {
    logger.error('Login error:', { error });
    res.status(401).json({
      status: 'error',
      message: 'Invalid token'
    });
  }
});

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: Generates a new access token using a refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', 
  validate(refreshTokenSchema),
  authController.refreshToken
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout user
 *     description: Invalidates the current session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', 
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      logger.info('User logged out', {
        userId: req.user?.id
      });
      res.json({ status: 'success' });
    } catch (error) {
      logger.error('Logout error:', { error });
      res.status(500).json({
        status: 'error',
        message: 'Failed to logout'
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email
 *     description: Verifies a user's email address
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid token
 */
router.post('/verify-email', 
  validate(verifyEmailSchema),
  authController.verifyEmail
);

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset
 *     description: Sends a password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent
 *       404:
 *         description: User not found
 */
router.post('/forgot-password', 
  authController.forgotPassword
);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password
 *     description: Resets a user's password using a reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid token
 */
router.post('/reset-password', 
  validate(resetPasswordSchema),
  authController.resetPassword
);

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password
 *     description: Changes a user's password (requires current password)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid current password
 */
router.post('/change-password', 
  authMiddleware,
  validate(changePasswordSchema),
  authController.changePassword
);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     description: Returns the current authenticated user's information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/me',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized'
        });
      }

      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          permissions: req.user.permissions
        }
      });
    } catch (error) {
      logger.error('Error getting user info:', { error });
      res.status(500).json({
        status: 'error',
        message: 'Failed to get user information'
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/permissions:
 *   get:
 *     tags: [Auth]
 *     summary: Get user permissions
 *     description: Returns the user's permissions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/permissions', 
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          status: 'error',
          message: 'User not authenticated'
        });
      }

      try {
        const authService = AuthService.getInstance();
        const userPermissions = await authService.getUserPermissions(req.user.id);
        
        // Check if userPermissions is an array (new implementation) or an object (old implementation)
        let permissionsArray: string[] = [];
        
        if (Array.isArray(userPermissions)) {
          permissionsArray = userPermissions;
        } else {
          // Assume it's the old UserPermissions object format
          permissionsArray = userPermissions.permissions || [];
        }

        logger.info('Retrieved user permissions', {
          userId: req.user.id,
          permissions: permissionsArray
        });

        res.json({
          permissions: permissionsArray
        });
      } catch (error) {
        logger.error('Error getting permissions:', { error });
        res.status(500).json({
          status: 'error',
          message: 'Failed to get permissions'
        });
      }
    } catch (error) {
      logger.error('Error getting permissions:', { error });
      res.status(500).json({
        status: 'error',
        message: 'Failed to get permissions'
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/auth/users:
 *   get:
 *     tags: [Auth]
 *     summary: Get users with permission
 *     description: Returns users with a specific permission (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: permission
 *         required: true
 *         schema:
 *           type: string
 *         description: Permission to check for
 *     responses:
 *       200:
 *         description: List of users
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/users', 
  authMiddleware,
  requireOrgRole(['admin']),
  authController.getUsersWithPermission
);

/**
 * @swagger
 * /api/v1/auth/permissions/{userId}:
 *   get:
 *     tags: [Auth]
 *     summary: Get permissions for a specific user
 *     description: Returns permissions for the specified user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to get permissions for
 *     responses:
 *       200:
 *         description: User permissions retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/permissions/:userId', 
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.params.userId;
      
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'User ID is required'
        });
      }

      try {
        const authService = AuthService.getInstance();
        const userPermissions = await authService.getUserPermissions(userId);
        
        // Check if userPermissions is an array (new implementation) or an object (old implementation)
        let permissionsArray: string[] = [];
        
        if (Array.isArray(userPermissions)) {
          permissionsArray = userPermissions;
        } else {
          // Assume it's the old UserPermissions object format
          permissionsArray = userPermissions.permissions || [];
        }

        logger.info('Retrieved user permissions', {
          userId,
          permissions: permissionsArray
        });

        res.json({
          permissions: permissionsArray
        });
      } catch (error) {
        logger.error('Error getting permissions:', { error });
        res.status(500).json({
          status: 'error',
          message: 'Failed to get permissions'
        });
      }
    } catch (error) {
      logger.error('Error getting permissions:', { error });
      res.status(500).json({
        status: 'error',
        message: 'Failed to get permissions'
      });
    }
  }
);

export default router; 