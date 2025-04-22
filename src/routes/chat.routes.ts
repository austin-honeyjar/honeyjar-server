import { Router } from 'express';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Apply logging middleware to all routes
router.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Apply authentication middleware to all chat routes
router.use(authMiddleware);

export default router; 