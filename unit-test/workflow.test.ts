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
    // Test conversation flow
    // Prompt: "What would you like to create today?"
    // Prompt: "What would you like to name this announcement?"
    // Prompt: "Would you like to generate any of the following assets? (Press Release, Media Pitch, Social Post)"
    // Prompt: "Would you like me to generate these assets for you?"
    // Prompt: "Would you like to provide the information directly in chat, or would you prefer to upload a document?"
    // Prompt: "Please provide the company name and product details."
    // Prompt: "Who is the target audience for this product?"
    // Prompt: "What are the key features and benefits of the product?"
    // Prompt: "What is the main value proposition or unique selling point?"
    // Prompt: "What is the call to action for potential customers?"
    const messages = [
      "I want to launch a new product",
      "Product Launch",
      "Press Release, Media Pitch, Social Post",
      "Yes, generate those",
      "I'll provide information directly in chat",
      "Our company is EcoTech, launching a sustainable water bottle",
      "Environmentally conscious consumers",
      "100% recycled materials, self-cleaning technology",
      "Reducing plastic waste while providing premium hydration",
      "Visit our website to pre-order",
      // This message will trigger the OpenAI service to generate assets using the template and collected inputs
      // The service will use the following template with filled-in values:
      `Generating assets using press release template and collected information:
      
Template Variables:
- Company Name: EcoTech
- Product Name: Sustainable Water Bottle
- Product Type: Self-cleaning water bottle
- Target Audience: Environmentally conscious consumers
- Key Features: 100% recycled materials, self-cleaning technology
- Value Proposition: Reducing plastic waste while providing premium hydration
- Call to Action: Visit our website to pre-order
`
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