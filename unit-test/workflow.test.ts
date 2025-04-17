import { WorkflowService } from '../src/services/workflow.service.js';
import { ChatService } from '../src/services/chat.service.js';
import { db } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import { chatMessages, chatThreads, workflowTemplates, workflows, workflowSteps } from '../src/db/schema.js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import fetch from 'node-fetch';

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
    
    // Create a test thread using the API
    console.log('Creating test thread...');
    const response = await fetch('http://localhost:3005/api/v1/chat/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Launch Announcement Test'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create thread: ${response.statusText}`);
    }

    const data = await response.json();
    const threadId = data.thread.id;
    console.log('Created thread:', threadId);

    // Test the complete workflow
    console.log('\nTesting complete workflow...');
    // Step 1: Initial Goal Assessment - "Hi, what are you looking to achieve for your PR goals today?"
    // Step 2: Announcement Type Selection - "We promote 6 different announcement types. They are: Product Launch, Funding Round, Partnership, Company Milestone, Executive Hire, and Industry Award. Would you like help creating one of these or did you have another in mind?"
    // Step 3: Asset Selection - "Based on your announcement type, we suggest the following assets. Which would you like to generate?"
    // Step 4: Asset Confirmation - "Please confirm which assets you'd like to generate"
    // Step 5: Information Collection - "To generate these assets, we need some information. Would you like to: 1) Fill out our complete onboarding form, 2) Upload existing bios or pitch transcripts, or 3) Provide information directly in chat?"
    // Step 6: Asset Generation - "Generating assets based on provided information..."
    // Step 7: Asset Review - "Here are the generated assets. Please review and let me know if you'd like any changes."
    // Step 8: Post-Asset Tasks - "Now that we have your assets ready, would you like help with: 1) Creating a media list, 2) Planning a publishing strategy, 3) Scheduling distribution, or 4) Something else?"
    const messages = [
      "I'm looking to create a comprehensive PR campaign for our new sustainable product launch",
      "I'd like to create a Product Launch announcement",
      "I'd like to generate a Press Release, Media Pitch, and Social Post",
      "Yes, please generate all three assets",
      "I'll provide the information directly in chat",
      "We are EcoTech, a sustainability-focused startup launching our first product - a revolutionary self-cleaning water bottle made from 100% recycled materials. Our mission is to reduce single-use plastic waste while providing premium hydration solutions.",
      "The assets look great! The messaging aligns well with our brand voice and the key features are highlighted effectively.",
      "I'd like help with creating a media list and planning the publishing strategy"
    ];

    for (const message of messages) {
      const response = await chatService.handleUserMessage(threadId, message);
      
      // Get the current workflow state
      const workflow = await workflowService.getWorkflowByThreadId(threadId);
      const currentStep = workflow?.steps.find(s => s.id === workflow?.currentStepId);
      
      console.log('\n=== Conversation Step ===');
      console.log('Step Name:', currentStep?.name);
      console.log('Step Prompt:', currentStep?.prompt);
      console.log('User Input:', message);
      console.log('AI Response:', response);
      console.log('Step Status:', currentStep?.status);
      console.log('Step Order:', currentStep?.order);
      console.log('Step Dependencies:', currentStep?.dependencies);
      console.log('Step Metadata:', currentStep?.metadata);
      console.log('Step AI Suggestion:', currentStep?.aiSuggestion);
      console.log('Step User Input:', currentStep?.userInput);
      console.log('=====================\n');
    }

    // Verify workflow completion
    const finalWorkflow = await workflowService.getWorkflowByThreadId(threadId);
    console.log('\nFinal workflow state:', {
      status: finalWorkflow?.status,
      currentStepId: finalWorkflow?.currentStepId,
      steps: finalWorkflow?.steps.map(s => ({
        name: s.name,
        status: s.status,
        order: s.order,
        prompt: s.prompt,
        userInput: s.userInput,
        aiSuggestion: s.aiSuggestion,
        dependencies: s.dependencies
      }))
    });
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Run the test
runWorkflowTest().catch(console.error); 