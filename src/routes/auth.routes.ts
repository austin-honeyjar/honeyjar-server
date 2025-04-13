import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/auth/public:
 *   get:
 *     tags: [Auth]
 *     summary: Public test endpoint
 *     description: Returns a public message
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: This is a public endpoint
 */
router.get('/public', (req, res) => {
  res.json({ message: 'This is a public endpoint' });
});

/**
 * @swagger
 * /api/auth/protected:
 *   get:
 *     tags: [Auth]
 *     summary: Protected test endpoint
 *     description: Returns a protected message and user info
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: This is a protected endpoint
 *                 user:
 *                   type: object
 *                 session:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/protected', authMiddleware, (req, res) => {
  logger.info('Accessing protected endpoint', { 
    userId: req.user?.id,
    sessionId: req.user?.sessionId
  });
  
  res.json({ 
    message: 'This is a protected endpoint',
    user: req.user,
    session: req.session
  });
});

/**
 * @swagger
 * /api/auth/session:
 *   get:
 *     tags: [Auth]
 *     summary: Get session information
 *     description: Returns the current session information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 sessionId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                 lastActiveAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/session', authMiddleware, (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'No session found' });
  }

  res.json({
    userId: req.session.userId,
    sessionId: req.session.sessionId,
    status: req.session.status,
    expiresAt: new Date(req.session.expireAt).toISOString(),
    lastActiveAt: new Date(req.session.lastActiveAt).toISOString()
  });
});

export default router; 