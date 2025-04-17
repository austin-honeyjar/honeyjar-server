import { WorkflowService } from '../src/services/workflow.service.js';
import { ChatService } from '../src/services/chat.service.js';
import { db } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import { chatMessages, chatThreads, workflowTemplates, workflows, workflowSteps, workflowStatusEnum, stepStatusEnum, stepTypeEnum } from '../src/db/schema.js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

async function setupDatabase() {
  console.log('Setting up database...');
  // Create a new connection for migrations
  const migrationClient = postgres(process.env.DATABASE_URL || 'postgresql://postgres:Password1@localhost:5432/client_db');
  const migrationDb = drizzle(migrationClient);

  try {
    // Create enums first
    console.log('Creating enums...');
    await migrationDb.execute(sql`
      DO $$ BEGIN
        CREATE TYPE workflow_status AS ENUM ('active', 'completed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE step_status AS ENUM ('pending', 'in_progress', 'complete', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE step_type AS ENUM ('ai_suggestion', 'user_input', 'api_call', 'data_transformation');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create tables
    console.log('Creating tables...');
    await migrationDb.execute(sql`
      CREATE TABLE IF NOT EXISTS workflow_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        steps JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id UUID NOT NULL REFERENCES chat_threads(id),
        template_id UUID NOT NULL REFERENCES workflow_templates(id),
        status workflow_status NOT NULL DEFAULT 'active',
        current_step_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('Database setup completed');
  } catch (error) {
    console.error('Database setup failed:', error);
    throw error;
  } finally {
    // Close migration connection
    await migrationClient.end();
  }
}

async function runWorkflowTest() {
  console.log('Starting workflow test...');
  
  try {
    // Setup database first
    await setupDatabase();

    // Initialize services
    const workflowService = new WorkflowService();
    const chatService = new ChatService();
    
    // Initialize templates
    console.log('Initializing workflow templates...');
    await workflowService.initializeTemplates();
    
    // Create a test thread
    console.log('Creating test thread...');
    const thread = await chatService.createThread('test-user', 'Launch Announcement Test');
    const threadId = thread.id;
    console.log('Created thread:', threadId);

    // Test the complete workflow
    console.log('\nTesting complete workflow...');
    
    // Start workflow
    console.log('\n1. Starting workflow...');
    const initialResponse = await chatService.handleUserMessage(
      threadId,
      'I want to create a launch announcement'
    );
    console.log('Initial response:', initialResponse);
    
    // Get workflow state
    const workflow = await workflowService.getWorkflowByThreadId(threadId);
    console.log('Workflow state:', workflow);
    
    // Target audience
    console.log('\n2. Providing target audience...');
    const targetAudienceResponse = await chatService.handleUserMessage(
      threadId,
      'Our target audience is tech-savvy professionals aged 25-45 who are interested in productivity tools.'
    );
    console.log('Target audience response:', targetAudienceResponse);
    
    // Key features
    console.log('\n3. Providing key features...');
    const keyFeaturesResponse = await chatService.handleUserMessage(
      threadId,
      'Key features include:\n1. AI-powered task management\n2. Real-time collaboration\n3. Smart notifications\n4. Cross-platform sync'
    );
    console.log('Key features response:', keyFeaturesResponse);
    
    // Value proposition
    console.log('\n4. Providing value proposition...');
    const valuePropResponse = await chatService.handleUserMessage(
      threadId,
      'Our product helps professionals save 10+ hours per week by automating routine tasks and providing intelligent insights.'
    );
    console.log('Value proposition response:', valuePropResponse);
    
    // Call to action
    console.log('\n5. Providing call to action...');
    const finalResponse = await chatService.handleUserMessage(
      threadId,
      'Sign up now for early access and get 3 months free!'
    );
    console.log('Final response:', finalResponse);

    // Verify workflow completion
    const completedWorkflow = await workflowService.getWorkflowByThreadId(threadId);
    console.log('Completed workflow state:', completedWorkflow);

    // Verify conversation flow
    console.log('\nVerifying conversation flow...');
    const messages = await chatService.getThreadMessages(threadId);
    console.log(`Total messages: ${messages.length}`);
    messages.forEach((msg, i) => {
      console.log(`Message ${i + 1}:`, msg.content.substring(0, 50) + '...');
    });

    // Test error case - invalid thread ID
    try {
      console.log('\nTesting error case with invalid thread ID...');
      await chatService.handleUserMessage('invalid-thread-id', 'Test message');
      console.log('Error: Expected an error for invalid thread ID');
    } catch (error) {
      console.log('Caught expected error:', error);
    }

    // Clean up
    console.log('\nCleaning up test data...');
    await db.delete(workflowSteps);
    await db.delete(workflows);
    await db.delete(chatMessages).where(eq(chatMessages.threadId, threadId));
    await db.delete(chatThreads).where(eq(chatThreads.id, threadId));
    await db.delete(workflowTemplates);
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Run the test
runWorkflowTest().catch(console.error); 