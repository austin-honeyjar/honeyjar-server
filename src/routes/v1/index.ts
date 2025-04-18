import { Router } from 'express';
import healthRoutes from '../health.routes';
import authRoutes from '../auth.routes';
import csvRoutes from '../csv.routes';
import chatRoutes from '../chat.routes';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);

// Auth routes
router.use('/auth', authRoutes);

// CSV routes
router.use('/csv', csvRoutes);

// Chat routes
router.use('/chat', chatRoutes);

// Add more v1 routes here...

export default router; 