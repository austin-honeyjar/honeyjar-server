import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import logger from '../utils/logger.js';

const router = Router();

// Public test endpoint
router.get('/public', (req, res) => {
  res.json({ message: 'This is a public endpoint' });
});

// Protected test endpoint
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

// Session info endpoint
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