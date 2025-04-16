import express from 'express';
import cors from 'cors';
import { config } from './config/index';
import { securityHeaders, rateLimiter } from './middleware/security.middleware';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec, swaggerUiOptions } from './config/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';
import logger from './utils/logger';
import csvRoutes from './routes/csv.routes';
import chatRoutes from './routes/chat.routes';
import { WorkflowService } from './services/workflow.service';

// Initialize express app
export const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(securityHeaders);
app.use(rateLimiter);

// Routes
app.use(config.server.apiPrefix + '/auth', authRoutes);
app.use(config.server.apiPrefix + '/csv', csvRoutes);
app.use(config.server.apiPrefix + '/chat', chatRoutes);

// Health check routes (unversioned)
app.use('/health', healthRoutes);

// Swagger documentation (only in development)
if (process.env.NODE_ENV === 'devlocal') {
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(swaggerSpec, swaggerUiOptions));
  
  // Serve raw OpenAPI spec in YAML
  app.get('/api-docs/api.yaml', (req, res) => {
    try {
      const yamlPath = join(process.cwd(), 'src', 'config', 'api.yaml');
      const yamlContent = readFileSync(yamlPath, 'utf8');
      res.setHeader('Content-Type', 'application/yaml');
      res.send(yamlContent);
    } catch (error) {
      logger.error('Error serving OpenAPI YAML:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to load API documentation',
      });
    }
  });

  logger.info('Swagger documentation available at /api-docs');
  logger.info('Raw OpenAPI spec available at /api-docs/api.yaml');
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
  
  // Initialize workflow templates
  const workflowService = new WorkflowService();
  workflowService.initializeTemplates()
    .then(() => {
      logger.info('Workflow templates initialized successfully');
      
      // Start server after templates are initialized
      app.listen(port, () => {
        logger.info(`Server is running on port ${port}`);
        if (process.env.NODE_ENV === 'devlocal') {
          logger.info(`API documentation available at http://localhost:${port}/api-docs`);
          logger.info(`Raw OpenAPI spec available at http://localhost:${port}/api-docs/api.yaml`);
        }
      });
    })
    .catch(error => {
      logger.error('Failed to initialize workflow templates:', error);
      process.exit(1);
    });
} 