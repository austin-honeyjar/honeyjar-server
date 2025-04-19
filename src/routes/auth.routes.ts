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
    const permissions = await authService.getUserPermissions(session.userId);

    logger.info('User logged in successfully', {
      userId: session.userId,
      permissions: permissions.permissions
    });

    res.json({
      accessToken: token,
      refreshToken: token, // Clerk handles refresh tokens internally
      user: {
        id: session.userId,
        email: permissions.email,
        permissions: permissions.permissions
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
 *     description: Returns the current user's permissions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User permissions
 *       401:
 *         description: Unauthorized
 */
router.get('/permissions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      logger.error('User not found in request');
      return res.status(401).json({ 
        status: 'error', 
        message: 'User not authenticated' 
      });
    }

    const authService = AuthService.getInstance();
    const permissions = await authService.getUserPermissions(req.user.id);

    logger.info('Returning user permissions:', {
      userId: req.user.id,
      permissions: permissions.permissions
    });

    res.json(permissions);
  } catch (error) {
    logger.error('Error getting user permissions:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get user permissions' 
    });
  }
});

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

export default router; 