import { Router } from 'express';
import healthRoutes from '../../routes/health.routes.js';
import authRoutes from '../../routes/auth.routes.js';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);

// Auth routes
router.use('/auth', authRoutes);

// Add more v1 routes here...

export default router; 