import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { securityHeaders, rateLimiter } from './middleware/security.middleware.js';
import authRoutes from './routes/auth.routes.js';
import healthRoutes from './routes/health.routes.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec, swaggerUiOptions } from './config/swagger.js';
import logger from './utils/logger.js';

// Initialize express app
export const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(securityHeaders);
app.use(rateLimiter);

// Routes
app.use(config.server.apiPrefix + '/auth', authRoutes);

// Health check routes (unversioned)
app.use('/health', healthRoutes);

// Swagger documentation (only in development)
if (process.env.NODE_ENV === 'devlocal') {
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(swaggerSpec, swaggerUiOptions));
  
  // Serve raw OpenAPI spec
  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  logger.info('Swagger documentation available at /api-docs');
}

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', { error: err });
  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'devlocal' ? err.message : 'Internal server error',
  });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  const port = config.server.port || 3005;
  app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
    if (process.env.NODE_ENV === 'devlocal') {
      logger.info(`API documentation available at http://localhost:${port}/api-docs`);
    }
  });
} 