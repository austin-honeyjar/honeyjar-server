import dotenv from 'dotenv';
dotenv.config();
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
import contextAwareChatRoutes from './routes/contextAwareChat.routes';
import threadsRoutes from './routes/threads.routes';
import assetRoutes from './routes/asset.routes';
import metabaseRoutes from './routes/metabase.routes';
import rocketreachRoutes from './routes/rocketreach.routes';
import newsRoutes from './routes/news.routes';
import { WorkflowService } from './services/workflow.service';
import { db, ensureTables } from './db/index';
import { sql } from 'drizzle-orm';
import { backgroundWorker } from './workers/backgroundWorker';

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
app.use(config.server.apiPrefix + '/chat', contextAwareChatRoutes);
app.use(config.server.apiPrefix + '/threads', threadsRoutes);
app.use(config.server.apiPrefix + '/metabase', metabaseRoutes);
app.use(config.server.apiPrefix + '/rocketreach', rocketreachRoutes);
app.use(config.server.apiPrefix + '/news', newsRoutes);
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
            content JSONB NOT NULL,
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

    // Initialize context-aware chat support
    try {
      logger.info('Setting up context-aware chat support...');
      
      // Add context-aware fields to chat_threads table
      await db.execute(sql`
        ALTER TABLE chat_threads 
        ADD COLUMN IF NOT EXISTS thread_type TEXT NOT NULL DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS context_id UUID,
        ADD COLUMN IF NOT EXISTS context_type TEXT,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `);

      // Create indexes for better performance
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_chat_threads_thread_type ON chat_threads(thread_type);
        CREATE INDEX IF NOT EXISTS idx_chat_threads_context ON chat_threads(context_type, context_id);
        CREATE INDEX IF NOT EXISTS idx_chat_threads_user_active ON chat_threads(user_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_chat_threads_org_type ON chat_threads(org_id, thread_type);
      `);

      // Update existing threads to have proper thread_type
      await db.execute(sql`
        UPDATE chat_threads SET thread_type = 'standard' WHERE thread_type IS NULL OR thread_type = '';
      `);

      // Add check constraints
      await db.execute(sql`
        ALTER TABLE chat_threads 
        ADD CONSTRAINT IF NOT EXISTS chk_thread_type 
        CHECK (thread_type IN ('global', 'asset', 'workflow', 'standard'));
      `);

      // Create function to auto-update updated_at
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_chat_threads_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);

      // Create trigger for auto-updating updated_at
      await db.execute(sql`
        DROP TRIGGER IF EXISTS trigger_chat_threads_updated_at ON chat_threads;
        CREATE TRIGGER trigger_chat_threads_updated_at
            BEFORE UPDATE ON chat_threads
            FOR EACH ROW
            EXECUTE FUNCTION update_chat_threads_updated_at();
      `);

      logger.info('Context-aware chat support initialized successfully');
    } catch (contextError) {
      logger.error('Error setting up context-aware chat support:', contextError);
      // Don't fail the entire initialization for this
    }
    
    // =============================================================================
    // STRUCTURED CONTENT MIGRATION
    // =============================================================================
    
    // Check if chat_messages.content is already JSONB
    logger.info('Checking chat_messages.content column type...');
    try {
      const contentColumnCheck = await db.execute(sql`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'chat_messages' 
        AND column_name = 'content';
      `);
      
      const currentDataType = contentColumnCheck[0]?.data_type;
      logger.info(`Current chat_messages.content data type: ${currentDataType}`);
      
      if (currentDataType === 'text') {
        logger.info('Migrating chat_messages.content from TEXT to JSONB for structured content support...');
        
        // First, add a new JSONB column for structured content
        await db.execute(sql`
          ALTER TABLE chat_messages 
          ADD COLUMN IF NOT EXISTS content_structured JSONB;
        `);
        
        // Migrate existing text content to structured format
        // We'll wrap existing string content in a basic structure
        await db.execute(sql`
          UPDATE chat_messages 
          SET content_structured = jsonb_build_object(
            'type', 'text',
            'text', content,
            'decorators', '[]'::jsonb,
            'metadata', '{}'::jsonb
          )
          WHERE content_structured IS NULL;
        `);
        
        // Make the new column NOT NULL now that all rows have values
        await db.execute(sql`
          ALTER TABLE chat_messages 
          ALTER COLUMN content_structured SET NOT NULL;
        `);
        
        // Drop the old text column
        await db.execute(sql`
          ALTER TABLE chat_messages 
          DROP COLUMN content;
        `);
        
        // Rename the new column to content
        await db.execute(sql`
          ALTER TABLE chat_messages 
          RENAME COLUMN content_structured TO content;
        `);
        
        logger.info('Successfully migrated chat_messages.content to JSONB structured format');
      } else if (currentDataType === 'jsonb') {
        logger.info('chat_messages.content is already JSONB - checking for proper structured format...');
        
        // Check if existing JSONB messages have proper structured format
        const unstructuredCheck = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM chat_messages 
          WHERE jsonb_typeof(content) = 'string';
        `);
        
        const unstructuredCount = parseInt(String(unstructuredCheck[0]?.count || 0));
        
        if (unstructuredCount > 0) {
          logger.info(`Found ${unstructuredCount} messages with string content, converting to structured format...`);
          
          // Convert string JSONB values to structured format
          await db.execute(sql`
            UPDATE chat_messages 
            SET content = jsonb_build_object(
              'type', 'text',
              'text', content #>> '{}',
              'decorators', '[]'::jsonb,
              'metadata', '{}'::jsonb
            )
            WHERE jsonb_typeof(content) = 'string';
          `);
          
          logger.info('Successfully converted unstructured JSONB messages to structured format');
        } else {
          logger.info('All JSONB messages are already in structured format');
        }
      } else {
        logger.warn(`Unexpected data type for chat_messages.content: ${currentDataType}`);
      }
    } catch (migrationError) {
      logger.error('Error during structured content migration:', migrationError);
      // Don't fail the server startup for migration issues
    }
    
    // =============================================================================
    // NEWS PIPELINE TABLES INITIALIZATION
    // =============================================================================
    
    // Check if news pipeline tables exist and create them if needed
    logger.info('Checking for news pipeline tables...');
    
    try {
      // Create news pipeline enums first
      logger.info('Creating news pipeline enums...');
      await db.execute(sql`
        DO $$ BEGIN
          CREATE TYPE "pipeline_run_status" AS ENUM ('running', 'completed', 'failed', 'partial');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
        
        DO $$ BEGIN
          CREATE TYPE "pipeline_run_type" AS ENUM ('daily_sync', 'author_scoring', 'cleanup', 'manual');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
        
        DO $$ BEGIN
          CREATE TYPE "monitoring_event_severity" AS ENUM ('low', 'medium', 'high', 'critical');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
        
        DO $$ BEGIN
          CREATE TYPE "api_call_type" AS ENUM ('articles', 'search', 'revoked', 'compliance_clicks');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
        
        DO $$ BEGIN
          CREATE TYPE "compliance_status" AS ENUM ('compliant', 'overdue', 'error');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      logger.info('News pipeline enums created successfully');
      
      // Create Metabase tables with proper schema
      logger.info('Creating Metabase tables with proper schema...');
      await db.execute(sql`
        -- Metabase API calls logging for sync history
        CREATE TABLE IF NOT EXISTS metabase_api_calls (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          call_type api_call_type NOT NULL,
          endpoint TEXT NOT NULL,
          parameters JSONB NOT NULL DEFAULT '{}',
          response_status INTEGER,
          response_time INTEGER, -- milliseconds
          articles_returned INTEGER DEFAULT 0,
          error_message TEXT,
          error_code TEXT, -- Metabase error codes (1000-9999)
          sequence_id TEXT, -- Last sequence ID from response
          rate_limit_info JSONB DEFAULT '{}',
          cache_hit BOOLEAN NOT NULL DEFAULT false,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        
        -- Metabase compliance status tracking
        CREATE TABLE IF NOT EXISTS metabase_compliance_status (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          check_date TIMESTAMP WITH TIME ZONE NOT NULL,
          revoked_articles_count INTEGER NOT NULL DEFAULT 0,
          articles_processed JSONB NOT NULL DEFAULT '[]',
          status compliance_status NOT NULL DEFAULT 'compliant',
          next_scheduled_check TIMESTAMP WITH TIME ZONE,
          errors JSONB DEFAULT '[]',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        
        -- Metabase articles storage with proper schema
        CREATE TABLE IF NOT EXISTS metabase_articles (
          id TEXT PRIMARY KEY, -- Using Metabase article ID as primary key
          title TEXT NOT NULL,
          summary TEXT,
          content TEXT,
          url TEXT NOT NULL,
          source TEXT NOT NULL,
          published_at TIMESTAMP WITH TIME ZONE,
          estimated_published_date TIMESTAMP WITH TIME ZONE,
          harvest_date TIMESTAMP WITH TIME ZONE,
          author TEXT,
          topics JSONB NOT NULL DEFAULT '[]',
          licenses JSONB NOT NULL DEFAULT '[]',
          click_url TEXT, -- For compliance clicking
          sequence_id TEXT, -- For pagination
          metadata JSONB NOT NULL DEFAULT '{}', -- Additional Metabase fields
          is_revoked BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        
        -- Metabase revoked articles tracking
        CREATE TABLE IF NOT EXISTS metabase_revoked_articles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          article_id TEXT NOT NULL,
          revoked_date TIMESTAMP WITH TIME ZONE NOT NULL,
          sequence_id TEXT, -- From revoked API response
          processed BOOLEAN NOT NULL DEFAULT false,
          processed_at TIMESTAMP WITH TIME ZONE,
          compliance_check_id UUID REFERENCES metabase_compliance_status(id),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
      `);
      
      // Handle migration for existing metabase_articles table - add missing columns
      logger.info('Checking and adding missing columns to metabase_articles table...');
      try {
        // Add estimated_published_date column if it doesn't exist
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS estimated_published_date TIMESTAMP WITH TIME ZONE;
        `);
        
        // Add harvest_date column if it doesn't exist
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS harvest_date TIMESTAMP WITH TIME ZONE;
        `);
        
        // Add licenses column if it doesn't exist
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS licenses JSONB NOT NULL DEFAULT '[]';
        `);
        
        // Add click_url column if it doesn't exist
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS click_url TEXT;
        `);
        
        // Add sequence_id column if it doesn't exist
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS sequence_id TEXT;
        `);
        
        // Add is_revoked column if it doesn't exist
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT false;
        `);
        
        // Add language column if it doesn't exist (for backward compatibility)
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'English';
        `);
        
        // Add source_rank column if it doesn't exist (for backward compatibility)
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS source_rank INTEGER DEFAULT 5;
        `);
        
        // Add source_country column if it doesn't exist (for backward compatibility)
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS source_country TEXT DEFAULT 'United States';
        `);
        
        // Add relevance_score column if it doesn't exist (for backward compatibility)
        await db.execute(sql`
          ALTER TABLE metabase_articles 
          ADD COLUMN IF NOT EXISTS relevance_score FLOAT DEFAULT 0.0;
        `);
        
        logger.info('Missing columns added to metabase_articles table successfully');
      } catch (columnError) {
        logger.error('Error adding missing columns to metabase_articles:', columnError);
      }
      
      // Continue with other news pipeline tables
      await db.execute(sql`
        -- News author relevance tracking and scoring
        CREATE TABLE IF NOT EXISTS news_authors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          email TEXT,
          organization TEXT,
          domain TEXT,
          relevance_score FLOAT NOT NULL DEFAULT 0.0,
          article_count INTEGER NOT NULL DEFAULT 0,
          recent_activity_score FLOAT NOT NULL DEFAULT 0.0,
          topics JSONB NOT NULL DEFAULT '[]',
          locations JSONB NOT NULL DEFAULT '[]',
          contact_info JSONB DEFAULT '{}',
          last_article_date TIMESTAMP WITH TIME ZONE,
          first_seen_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        
        -- News pipeline processing runs and logs
        CREATE TABLE IF NOT EXISTS news_pipeline_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          run_type pipeline_run_type NOT NULL,
          status pipeline_run_status NOT NULL,
          articles_processed INTEGER DEFAULT 0,
          articles_filtered INTEGER DEFAULT 0,
          authors_updated INTEGER DEFAULT 0,
          authors_created INTEGER DEFAULT 0,
          records_cleaned INTEGER DEFAULT 0,
          execution_time INTEGER,
          sequence_id_start TEXT,
          sequence_id_end TEXT,
          error_message TEXT,
          error_code TEXT,
          filters_applied JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
          completed_at TIMESTAMP WITH TIME ZONE
        );
        
        -- Production monitoring and alerting events
        CREATE TABLE IF NOT EXISTS monitoring_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type TEXT NOT NULL,
          severity monitoring_event_severity NOT NULL,
          source TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          details JSONB DEFAULT '{}',
          affected_services JSONB DEFAULT '[]',
          resolved BOOLEAN DEFAULT false,
          resolved_by TEXT,
          resolved_at TIMESTAMP WITH TIME ZONE,
          escalated BOOLEAN DEFAULT false,
          escalated_at TIMESTAMP WITH TIME ZONE,
          notification_sent BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        
        -- Author-Article relationship tracking (for scoring)
        CREATE TABLE IF NOT EXISTS news_author_articles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          author_id UUID NOT NULL,
          article_id TEXT NOT NULL,
          role TEXT DEFAULT 'author',
          relevance_score FLOAT DEFAULT 1.0,
          extracted_from TEXT DEFAULT 'byline',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
      `);
      
      // Create indexes for Metabase and news pipeline tables
      logger.info('Creating indexes for Metabase and news pipeline tables...');
      await db.execute(sql`
        -- Metabase API calls indexes
        CREATE INDEX IF NOT EXISTS idx_metabase_api_calls_type ON metabase_api_calls(call_type);
        CREATE INDEX IF NOT EXISTS idx_metabase_api_calls_created_at ON metabase_api_calls(created_at);
        CREATE INDEX IF NOT EXISTS idx_metabase_api_calls_status ON metabase_api_calls(response_status);
        
        -- Metabase compliance indexes
        CREATE INDEX IF NOT EXISTS idx_metabase_compliance_check_date ON metabase_compliance_status(check_date);
        CREATE INDEX IF NOT EXISTS idx_metabase_compliance_status ON metabase_compliance_status(status);
        
        -- Metabase articles indexes for fast searching
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_title_search ON metabase_articles USING gin(to_tsvector('english', title));
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_content_search ON metabase_articles USING gin(to_tsvector('english', content));
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_author ON metabase_articles(author) WHERE author IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_source ON metabase_articles(source) WHERE source IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_published ON metabase_articles(published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_is_revoked ON metabase_articles(is_revoked);
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_sequence_id ON metabase_articles(sequence_id);
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_language_rank ON metabase_articles(language, source_rank, source_country);
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_topics ON metabase_articles USING gin(topics);
        CREATE INDEX IF NOT EXISTS idx_metabase_articles_relevance ON metabase_articles(relevance_score DESC);
        
        -- Metabase revoked articles indexes
        CREATE INDEX IF NOT EXISTS idx_metabase_revoked_article_id ON metabase_revoked_articles(article_id);
        CREATE INDEX IF NOT EXISTS idx_metabase_revoked_processed ON metabase_revoked_articles(processed);
        CREATE INDEX IF NOT EXISTS idx_metabase_revoked_date ON metabase_revoked_articles(revoked_date);
        
        -- Author scoring and retrieval indexes
        CREATE INDEX IF NOT EXISTS idx_authors_relevance ON news_authors(relevance_score DESC, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_authors_activity ON news_authors(recent_activity_score DESC, last_article_date DESC);
        CREATE INDEX IF NOT EXISTS idx_authors_name_search ON news_authors USING gin(to_tsvector('english', name));
        CREATE INDEX IF NOT EXISTS idx_authors_organization ON news_authors(organization) WHERE organization IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_authors_domain ON news_authors(domain) WHERE domain IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_authors_topics ON news_authors USING gin(topics);
        
        -- Pipeline monitoring indexes
        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON news_pipeline_runs(status, run_type, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_errors ON news_pipeline_runs(status, error_code) WHERE status = 'failed';
        
        -- Monitoring and alerting indexes
        CREATE INDEX IF NOT EXISTS idx_monitoring_events_unresolved ON monitoring_events(resolved, severity, created_at DESC) WHERE resolved = false;
        CREATE INDEX IF NOT EXISTS idx_monitoring_events_source ON monitoring_events(source, event_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_monitoring_events_critical ON monitoring_events(created_at DESC) WHERE severity = 'critical' AND resolved = false;
        
        -- Author-Article relationship indexes
        CREATE INDEX IF NOT EXISTS idx_author_articles_author ON news_author_articles(author_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_author_articles_article ON news_author_articles(article_id);
        CREATE INDEX IF NOT EXISTS idx_author_articles_relevance ON news_author_articles(author_id, relevance_score DESC);
      `);
      
      // Create trigger to update updated_at timestamp on metabase_articles
      logger.info('Creating update trigger for metabase_articles...');
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
        
        DROP TRIGGER IF EXISTS update_metabase_articles_updated_at ON metabase_articles;
        CREATE TRIGGER update_metabase_articles_updated_at 
          BEFORE UPDATE ON metabase_articles 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column();
      `);
      
      logger.info('Metabase and news pipeline tables and indexes created successfully');
      
    } catch (newsPipelineError) {
      logger.error('Error creating Metabase and news pipeline tables:', newsPipelineError);
      // Don't fail the server startup for news pipeline table issues
    }
    
    // =============================================================================
    // ROCKETREACH TABLES INITIALIZATION
    // =============================================================================
    
    // Check if RocketReach tables exist and create them if needed
    logger.info('Checking for RocketReach tables...');
    
    try {
      // Check if rocketreach_api_calls table exists
      const rocketReachTableCheck = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'rocketreach_api_calls'
        );
      `);
      
      if (!rocketReachTableCheck[0]?.exists) {
        logger.info('RocketReach tables not found, creating them...');
        
        // Create RocketReach enums first
        logger.info('Creating RocketReach enums...');
        await db.execute(sql`
          DO $$ BEGIN
            CREATE TYPE "rocketreach_api_call_type" AS ENUM ('person_lookup', 'person_search', 'company_lookup', 'company_search', 'bulk_lookup', 'account');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        logger.info('RocketReach enums created successfully');
        
        // Create RocketReach tables
        logger.info('Creating RocketReach tables...');
        await db.execute(sql`
          -- RocketReach person profiles storage
          CREATE TABLE IF NOT EXISTS rocketreach_persons (
            id INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            first_name TEXT,
            last_name TEXT,
            middle_name TEXT,
            current_employer TEXT,
            current_title TEXT,
            linkedin_url TEXT,
            profile_pic TEXT,
            location TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            emails JSONB NOT NULL DEFAULT '[]',
            phones JSONB NOT NULL DEFAULT '[]',
            social_media JSONB DEFAULT '{}',
            work_history JSONB NOT NULL DEFAULT '[]',
            education JSONB NOT NULL DEFAULT '[]',
            metadata JSONB NOT NULL DEFAULT '{}',
            credits_used INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
          );
          
          -- RocketReach company profiles storage
          CREATE TABLE IF NOT EXISTS rocketreach_companies (
            id INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            domain TEXT,
            linkedin_url TEXT,
            website TEXT,
            description TEXT,
            industry TEXT,
            location TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            founded_year INTEGER,
            employees INTEGER,
            revenue TEXT,
            technology_stack JSONB NOT NULL DEFAULT '[]',
            social_media JSONB DEFAULT '{}',
            metadata JSONB NOT NULL DEFAULT '{}',
            credits_used INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
          );
          
          -- RocketReach API calls logging
          CREATE TABLE IF NOT EXISTS rocketreach_api_calls (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            call_type rocketreach_api_call_type NOT NULL,
            endpoint TEXT NOT NULL,
            parameters JSONB NOT NULL DEFAULT '{}',
            response_status INTEGER,
            response_time INTEGER,
            records_returned INTEGER DEFAULT 0,
            credits_used INTEGER DEFAULT 0,
            credits_remaining INTEGER,
            error_message TEXT,
            error_code TEXT,
            cache_hit BOOLEAN NOT NULL DEFAULT false,
            user_id TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
          );
          
          -- RocketReach bulk lookup tracking
          CREATE TABLE IF NOT EXISTS rocketreach_bulk_lookups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            rocketreach_request_id TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            lookup_count INTEGER NOT NULL,
            webhook_id TEXT,
            estimated_completion_time TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            results JSONB DEFAULT '[]',
            credits_used INTEGER DEFAULT 0,
            error_message TEXT,
            user_id TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
          );
        `);
        
        // Create indexes for RocketReach tables
        logger.info('Creating indexes for RocketReach tables...');
        await db.execute(sql`
          -- Person profiles indexes
          CREATE INDEX IF NOT EXISTS idx_rocketreach_persons_name ON rocketreach_persons(name);
          CREATE INDEX IF NOT EXISTS idx_rocketreach_persons_employer ON rocketreach_persons(current_employer) WHERE current_employer IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_rocketreach_persons_created ON rocketreach_persons(created_at DESC);
          
          -- Company profiles indexes
          CREATE INDEX IF NOT EXISTS idx_rocketreach_companies_name ON rocketreach_companies(name);
          CREATE INDEX IF NOT EXISTS idx_rocketreach_companies_domain ON rocketreach_companies(domain) WHERE domain IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_rocketreach_companies_industry ON rocketreach_companies(industry) WHERE industry IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_rocketreach_companies_created ON rocketreach_companies(created_at DESC);
          
          -- API calls tracking indexes
          CREATE INDEX IF NOT EXISTS idx_rocketreach_api_calls_type ON rocketreach_api_calls(call_type, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_rocketreach_api_calls_user ON rocketreach_api_calls(user_id, created_at DESC) WHERE user_id IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_rocketreach_api_calls_status ON rocketreach_api_calls(response_status, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_rocketreach_api_calls_credits ON rocketreach_api_calls(credits_used, created_at DESC);
          
          -- Bulk lookups indexes
          CREATE INDEX IF NOT EXISTS idx_rocketreach_bulk_status ON rocketreach_bulk_lookups(status, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_rocketreach_bulk_user ON rocketreach_bulk_lookups(user_id, created_at DESC) WHERE user_id IS NOT NULL;
        `);
        
        logger.info('RocketReach tables and indexes created successfully');
        
      } else {
        logger.info('RocketReach tables already exist');
      }
      
    } catch (rocketReachError) {
      logger.error('Error creating RocketReach tables:', rocketReachError);
      // Don't fail the server startup for RocketReach table issues
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
        
        // Initialize background services
        return initializeBackgroundServices();
      }).then(() => {
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

// Initialize background services
async function initializeBackgroundServices(): Promise<void> {
  try {
    await backgroundWorker.initialize();
    logger.info('Background services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize background services', { error: (error as Error).message });
    // Don't fail the server startup for background worker issues
  }
}

// Add graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  try {
    await backgroundWorker.shutdown();
    logger.info('Background worker shutdown completed');
  } catch (error) {
    logger.error('Error during background worker shutdown', { error: (error as Error).message });
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  try {
    await backgroundWorker.shutdown();
    logger.info('Background worker shutdown completed');
  } catch (error) {
    logger.error('Error during background worker shutdown', { error: (error as Error).message });
  }
  process.exit(0);
}); 