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
import threadsRoutes from './routes/threads.routes';
import assetRoutes from './routes/asset.routes';
import metabaseRoutes from './routes/metabase.routes';
import { WorkflowService } from './services/workflow.service';
import { db, ensureTables } from './db/index';
import { sql } from 'drizzle-orm';

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
app.use(config.server.apiPrefix + '/threads', threadsRoutes);
app.use(config.server.apiPrefix + '/metabase', metabaseRoutes);
app.use(config.server.apiPrefix, assetRoutes);

// Health check routes (unversioned)
app.use('/health', healthRoutes);

// Swagger documentation (only in development)
if (process.env.NODE_ENV === 'development') {
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
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// Function to initialize database tables
async function initializeDatabase() {
  try {
    // First run migrations to ensure tables exist
    try {
      await ensureTables();
      logger.info('Database migrations completed');
    } catch (migrationError) {
      logger.error('Error during migrations, will try direct SQL initialization:', migrationError);
    }
    
    // Check if the step_type enum has JSON_DIALOG
    const stepTypeEnumCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_type 
        JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'step_type' 
        AND pg_enum.enumlabel = 'json_dialog'
      );
    `);
    
    // Add JSON_DIALOG to step_type enum if it doesn't exist
    if (!stepTypeEnumCheck[0]?.exists) {
      logger.info('Adding JSON_DIALOG to step_type enum...');
      try {
        await db.execute(sql`
          ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'json_dialog';
        `);
        logger.info('JSON_DIALOG added to step_type enum successfully');
      } catch (enumError) {
        logger.error('Error adding JSON_DIALOG to step_type enum:', enumError);
        
        // Alternative approach if the above fails (for PostgreSQL versions that don't support ADD VALUE)
        try {
          logger.info('Trying alternative approach to update step_type enum...');
          await db.execute(sql`
            -- Create a new enum type with all values including the new one
            CREATE TYPE step_type_new AS ENUM ('ai_suggestion', 'user_input', 'api_call', 'data_transformation', 'asset_creation', 'json_dialog');
            
            -- Update the workflow_steps table to use the new enum
            ALTER TABLE workflow_steps 
              ALTER COLUMN step_type TYPE step_type_new 
              USING step_type::text::step_type_new;
            
            -- Drop the old enum type
            DROP TYPE step_type;
            
            -- Rename the new enum type to the original name
            ALTER TYPE step_type_new RENAME TO step_type;
          `);
          logger.info('step_type enum updated successfully using alternative method');
        } catch (alternativeError) {
          logger.error('Error updating step_type enum using alternative method:', alternativeError);
        }
      }
    } else {
      logger.info('JSON_DIALOG already exists in step_type enum');
    }
    
    // Check if the step_type enum has GENERATE_THREAD_TITLE
    const generateTitleEnumCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_type 
        JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'step_type' 
        AND pg_enum.enumlabel = 'generate_thread_title'
      );
    `);
    
    // Add GENERATE_THREAD_TITLE to step_type enum if it doesn't exist
    if (!generateTitleEnumCheck[0]?.exists) {
      logger.info('Adding GENERATE_THREAD_TITLE to step_type enum...');
      try {
        await db.execute(sql`
          ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'generate_thread_title';
        `);
        logger.info('GENERATE_THREAD_TITLE added to step_type enum successfully');
      } catch (enumError) {
        logger.error('Error adding GENERATE_THREAD_TITLE to step_type enum:', enumError);
        
        // Alternative approach if the above fails
        try {
          logger.info('Trying alternative approach to update step_type enum with generate_thread_title...');
          await db.execute(sql`
            -- Create a new enum type with all values including the new one
            CREATE TYPE step_type_new AS ENUM ('ai_suggestion', 'user_input', 'api_call', 'data_transformation', 'asset_creation', 'json_dialog', 'generate_thread_title');
            
            -- Update the workflow_steps table to use the new enum
            ALTER TABLE workflow_steps 
              ALTER COLUMN step_type TYPE step_type_new 
              USING step_type::text::step_type_new;
            
            -- Drop the old enum type
            DROP TYPE step_type;
            
            -- Rename the new enum type to the original name
            ALTER TYPE step_type_new RENAME TO step_type;
          `);
          logger.info('step_type enum updated successfully with generate_thread_title using alternative method');
        } catch (alternativeError) {
          logger.error('Error updating step_type enum with generate_thread_title using alternative method:', alternativeError);
        }
      }
    } else {
      logger.info('GENERATE_THREAD_TITLE already exists in step_type enum');
    }
    
    // Check if the assets table exists
    const assetTableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'assets'
      );
    `);
    
    if (!assetTableCheck[0]?.exists) {
      logger.info('Assets table not found, running full database initialization...');
      
      try {
        // Enable UUID extension first
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        logger.info('UUID extension enabled');
        
        // Run the full initialization script for all tables
        await db.execute(sql`
          -- Create enums
          DO $$ BEGIN
           CREATE TYPE "workflow_status" AS ENUM ('active', 'completed', 'failed');
          EXCEPTION
           WHEN duplicate_object THEN null;
          END $$;
          
          DO $$ BEGIN
           CREATE TYPE "step_status" AS ENUM ('pending', 'in_progress', 'complete', 'failed');
          EXCEPTION
           WHEN duplicate_object THEN null;
          END $$;
          
          DO $$ BEGIN
           CREATE TYPE "step_type" AS ENUM ('ai_suggestion', 'user_input', 'api_call', 'data_transformation', 'asset_creation', 'json_dialog', 'generate_thread_title');
          EXCEPTION
           WHEN duplicate_object THEN null;
          END $$;
          
          -- Create chat_threads table
          CREATE TABLE IF NOT EXISTS chat_threads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            org_id TEXT,
            title TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          -- Create chat_messages table
          CREATE TABLE IF NOT EXISTS chat_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            thread_id UUID NOT NULL REFERENCES chat_threads(id),
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          -- Create csv_metadata table
          CREATE TABLE IF NOT EXISTS csv_metadata (
            id SERIAL PRIMARY KEY,
            table_name TEXT NOT NULL UNIQUE,
            column_names TEXT[] NOT NULL,
            file_name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          -- Create workflow_templates table
          CREATE TABLE IF NOT EXISTS workflow_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            steps JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          -- Create workflows table
          CREATE TABLE IF NOT EXISTS workflows (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            thread_id UUID NOT NULL REFERENCES chat_threads(id),
            template_id UUID NOT NULL REFERENCES workflow_templates(id),
            status workflow_status NOT NULL DEFAULT 'active',
            current_step_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          -- Create workflow_steps table
          CREATE TABLE IF NOT EXISTS workflow_steps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workflow_id UUID NOT NULL REFERENCES workflows(id),
            step_type step_type NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            prompt TEXT,
            status step_status NOT NULL DEFAULT 'pending',
            "order" INTEGER NOT NULL,
            dependencies JSONB NOT NULL DEFAULT '[]',
            metadata JSONB,
            ai_suggestion TEXT,
            user_input TEXT,
            openai_prompt TEXT,
            openai_response TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          -- Create workflow_history table
          CREATE TABLE IF NOT EXISTS workflow_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workflow_id UUID NOT NULL REFERENCES workflows(id),
            step_id UUID REFERENCES workflow_steps(id),
            action TEXT NOT NULL,
            previous_state JSONB NOT NULL,
            new_state JSONB NOT NULL,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          -- Create assets table
          CREATE TABLE IF NOT EXISTS assets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            thread_id UUID NOT NULL REFERENCES chat_threads(id),
            workflow_id UUID REFERENCES workflows(id),
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT,
            content TEXT NOT NULL,
            author TEXT NOT NULL,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        
        logger.info('Full database initialization completed successfully');
        
        // Ensure helpful indexes exist for performance
        logger.info('Ensuring DB indexes exist');
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_threads_user_org ON chat_threads (user_id, org_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages (thread_id, created_at);`);
        logger.info('Index check/creation complete');
      } catch (sqlError) {
        logger.error('Error during SQL initialization:', sqlError);
        // Try a final attempt with just the assets table
        try {
          logger.info('Attempting to create just the assets table...');
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS assets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              thread_id UUID NOT NULL,
              workflow_id UUID,
              name TEXT NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              subtitle TEXT,
              content TEXT NOT NULL,
              author TEXT NOT NULL,
              metadata JSONB,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);
          logger.info('Assets table created successfully (without foreign key constraints)');
        } catch (finalError) {
          logger.error('All database initialization attempts failed:', finalError);
          return false;
        }
      }
    } else {
      logger.info('Assets table already exists');
    }
    
    return true;
  } catch (error) {
    logger.error('Database initialization error:', error);
    return false;
  }
}

// Start server
if (process.env.NODE_ENV !== 'test') {
  const port = config.server.port || 3005;
  
  // Initialize database first, then workflow templates, then start server
  initializeDatabase()
    .then((dbSuccess) => {
      if (!dbSuccess) {
        logger.warn('Database initialization had errors, but continuing startup');
      }
      
      // Initialize workflow templates
      const workflowService = new WorkflowService();
      
      // Log templates
      return workflowService.initializeTemplates().then(() => {
        console.log('Workflow templates initialized');
        
        // Start the server
        app.listen(port, () => {
          logger.info(`Server listening on port ${port}`);
          
          // Print the API address
          const host = `http://localhost:${port}${config.server.apiPrefix}`;
          logger.info(`API available at: ${host}`);
          
          // Print route to Swagger UI
          logger.info(`API Documentation: ${host}/docs`);
        });
      });
    })
    .catch((err) => {
      logger.error('Server startup error:', err);
      process.exit(1);
    });
} 