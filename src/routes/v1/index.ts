import { Router } from 'express';
import healthRoutes from '../health.routes';
import authRoutes from '../auth.routes';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);

// Auth routes
router.use('/auth', authRoutes);

// Add more v1 routes here...

export default router; 