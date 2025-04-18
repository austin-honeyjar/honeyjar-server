import { WorkflowService } from '../src/services/workflow.service.js';
import { ChatService } from '../src/services/chat.service.js';
import { db } from '../src/db/index.js';
import { chatThreads, workflowTemplates } from '../src/db/schema.js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { BASE_WORKFLOW_TEMPLATE } from '../src/templates/workflows/base-workflow.js';
import { StepStatus } from '../src/types/workflow.js';

async function setupTestDatabase() {
  console.log('Setting up test database...');
  const migrationClient = postgres(process.env.DATABASE_URL || 'postgresql://postgres:Password1@localhost:5432/client_db');
  const migrationDb = drizzle(migrationClient);

  try {
    // Clear all existing data
    console.log('Clearing existing data...');
    await migrationDb.execute(sql`TRUNCATE workflow_templates, workflows, workflow_steps, chat_threads, chat_messages CASCADE`);

    // Insert only the base workflow template
    console.log('Inserting base workflow template...');
    const [baseTemplate] = await migrationDb.insert(workflowTemplates)
      .values({
        name: BASE_WORKFLOW_TEMPLATE.name,
        description: BASE_WORKFLOW_TEMPLATE.description,
        steps: BASE_WORKFLOW_TEMPLATE.steps,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    console.log('Base template created:', baseTemplate);
    return baseTemplate;
  } finally {
    await migrationClient.end();
  }
}

async function testBaseWorkflow() {
  console.log('\n=== Starting Base Workflow Test ===\n');
  
  try {
    // Setup clean database with only base template
    const baseTemplate = await setupTestDatabase();
    
    // Initialize services
    const workflowService = new WorkflowService();
    const chatService = new ChatService();

    // Create a test thread
    console.log('Creating test thread...');
    const [thread] = await db.insert(chatThreads)
      .values({
        title: 'Base Workflow Test',
        userId: 'test-user'
      })
      .returning();
    console.log('Thread created:', thread.id);

    // Create base workflow
    console.log('Creating base workflow...');
    const workflow = await workflowService.createWorkflow(thread.id, baseTemplate.id);
    console.log('Base workflow created:', workflow.id);

    // Get initial workflow state
    const initialWorkflow = await workflowService.getWorkflow(workflow.id);
    console.log('\nInitial workflow state:', {
      id: initialWorkflow?.id,
      currentStepId: initialWorkflow?.currentStepId,
      steps: initialWorkflow?.steps.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        order: s.order
      }))
    });

    // Process Step 1: Workflow Selection
    console.log('\n=== Step 1: Workflow Selection ===');
    const response1 = await chatService.handleUserMessage(thread.id, "Launch Announcement");
    console.log('Response 1:', response1);

    // Check workflow state after step 1
    const workflowAfterStep1 = await workflowService.getWorkflow(workflow.id);
    console.log('\nWorkflow state after step 1:', {
      id: workflowAfterStep1?.id,
      currentStepId: workflowAfterStep1?.currentStepId,
      steps: workflowAfterStep1?.steps.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        order: s.order,
        userInput: s.userInput
      }))
    });

    // Process Step 2: Thread Title
    console.log('\n=== Step 2: Thread Title ===');
    const response2 = await chatService.handleUserMessage(thread.id, "My Test Workflow");
    console.log('Response 2:', response2);

    // Verify Step 2 completion

    // Check final workflow state
    const finalWorkflow = await workflowService.getWorkflow(workflow.id);
    console.log('\nFinal workflow state:', {
      id: finalWorkflow?.id,
      currentStepId: finalWorkflow?.currentStepId,
      status: finalWorkflow?.status,
      steps: finalWorkflow?.steps.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        order: s.order,
        userInput: s.userInput
      }))
    });

    console.log('\n=== Test Completed Successfully ===\n');
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Run the test
testBaseWorkflow().catch(console.error); 