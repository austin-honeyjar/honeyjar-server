import express from 'express';
import cors from 'cors';
import { securityHeaders, rateLimiter } from './middleware/security.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import logger from './utils/logger.js';
import { config } from './config/index.js';

// Initialize express app
export const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security middleware
app.use(securityHeaders);
app.use(cors(config.security.cors));
app.use(rateLimiter);

// Routes
app.use(config.server.apiPrefix + '/auth', authRoutes);

// Error handling
app.use(errorHandler);

// Start server
const isDev = process.env.NODE_ENV === 'devlocal';
app.listen(config.server.port, () => {
  logger.info(`Server running on port ${config.server.port}`, {
    env: config.server.env,
    apiPrefix: config.server.apiPrefix,
  });
}); 