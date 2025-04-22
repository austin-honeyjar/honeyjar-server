import { WorkflowService } from '../src/services/workflow.service.js';
import { ChatService } from '../src/services/chat.service.js';
import { db } from '../src/db/index.js';
import { chatThreads, workflowTemplates, workflows, workflowSteps } from '../src/db/schema.js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { BASE_WORKFLOW_TEMPLATE } from '../src/templates/workflows/base-workflow.js';
import { LAUNCH_ANNOUNCEMENT_TEMPLATE } from '../src/templates/workflows/launch-announcement.js';
import { StepStatus, WorkflowStatus } from '../src/types/workflow.js';
import { eq, asc } from 'drizzle-orm';

async function setupTestDatabase() {
  console.log('Setting up test database for Base + Launch...');
  const migrationClient = postgres(process.env.DATABASE_URL || 'postgresql://postgres:Password1@localhost:5432/client_db');
  const migrationDb = drizzle(migrationClient);

  try {
    // Clear all existing data
    console.log('Clearing existing data...');
    await migrationDb.execute(sql`TRUNCATE workflow_templates, workflows, workflow_steps, chat_threads, chat_messages CASCADE`);

    // Insert required templates
    console.log('Inserting test templates (Base, Launch Announcement)...');
    const [baseTemplate] = await migrationDb.insert(workflowTemplates)
      .values({
        name: BASE_WORKFLOW_TEMPLATE.name,
        description: BASE_WORKFLOW_TEMPLATE.description,
        steps: BASE_WORKFLOW_TEMPLATE.steps,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    const [launchTemplate] = await migrationDb.insert(workflowTemplates)
      .values({
        name: LAUNCH_ANNOUNCEMENT_TEMPLATE.name,
        description: LAUNCH_ANNOUNCEMENT_TEMPLATE.description,
        steps: LAUNCH_ANNOUNCEMENT_TEMPLATE.steps,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    console.log('Templates created:', {
      base: baseTemplate.id,
      launch: launchTemplate.id
    });
    
    return { baseTemplate, launchTemplate };
  } finally {
    await migrationClient.end();
  }
}

async function runBaseThenLaunchTest() {
  console.log('\n=== Starting Base + Launch Announcement Sequential Test (Mirroring Base Test Logic) ===\n');
  
  try {
    // Setup clean database with templates
    const { baseTemplate, launchTemplate } = await setupTestDatabase();

    // Initialize services
    const workflowService = new WorkflowService();
    const chatService = new ChatService();
    
    // Create test thread
    console.log('Creating test thread...');
    const [thread] = await db.insert(chatThreads)
      .values({
        title: 'Base -> Launch Announcement Test',
        userId: 'test-user-sequential'
      })
      .returning();
    const threadId = thread.id;
    console.log('Thread created:', threadId);

    // === Base Workflow Phase ===
    console.log('\nCreating base workflow...');
    const baseWorkflow = await workflowService.createWorkflow(threadId, baseTemplate.id);
    console.log('Base workflow created:', baseWorkflow.id);

    // Process Base Step 1: Select "Launch Announcement"
    console.log('\n=== Processing Base Step 1: Selecting Launch Announcement ===');
    await chatService.handleUserMessage(threadId, "Launch Announcement");

    // Process Base Step 2: Set thread title
    console.log('\n=== Processing Base Step 2: Setting Thread Title ===');
    await chatService.handleUserMessage(threadId, "New Product Launch Campaign Title");

    // Verify Base Workflow completion (Mimicking base-workflow.test.ts check)
    const completedBase = await workflowService.getWorkflow(baseWorkflow.id);
    let baseStep2State = completedBase?.steps.find(s => s.name === "Thread Title and Summary");
    console.log('Base Step 2 State:', { status: baseStep2State?.status, userInput: baseStep2State?.userInput });
    if (baseStep2State?.status !== StepStatus.COMPLETE) throw new Error("Base Step 2 did not complete.");
    console.log('\nBase workflow final state:', { status: completedBase?.status });
    if (completedBase?.status !== WorkflowStatus.COMPLETED) {
      // We still need this check to ensure the test preconditions are met
      throw new Error('Base workflow not marked as completed after step 2 processed.'); 
    } else {
       console.log('Base workflow correctly marked as COMPLETED.');
    }

    // === Launch Announcement Workflow Phase ===
    // Mimicking the structure from base-workflow.test.ts lines 115-133
    console.log('\n=== Verifying Launch Announcement Workflow Creation (Base Test Style) ===');
    
    // 1. Check if workflow exists using getWorkflowByThreadId
    let launchWorkflow = await workflowService.getWorkflowByThreadId(threadId); 
    
    // 2. If not found, create it manually
    if (!launchWorkflow) {
        console.log('ChatService did not create Launch Workflow automatically, creating manually...');
        // Note: We don't assign the result here directly in the base-test style
        await workflowService.createWorkflow(threadId, launchTemplate.id); 
        
        // 3. Re-fetch using getWorkflowByThreadId *after* manual creation attempt
        const createdLaunchWorkflow = await workflowService.getWorkflowByThreadId(threadId);
         if (!createdLaunchWorkflow) {
             throw new Error('Launch Announcement workflow could not be created or found after manual attempt');
         }
         console.log('Launch Announcement workflow created manually:', createdLaunchWorkflow.id);
         // Assign it to launchWorkflow for later use (needed for processing steps)
         launchWorkflow = createdLaunchWorkflow; 
    } else {
        console.log('Launch Announcement workflow created/found automatically by ChatService:', launchWorkflow.id);
    }
    
    // 4. Get the definitive active workflow using getWorkflowByThreadId *again* 
    //    (This is the crucial part mirroring base-workflow.test.ts)
    const activeLaunchWorkflow = await workflowService.getWorkflowByThreadId(threadId);
    if (!activeLaunchWorkflow) {
        // This shouldn't happen if the above logic worked, but good to have a check
        throw new Error("Could not get active Launch Announcement Workflow after verification/creation.");
    } 
    console.log('Active Launch Workflow State (Post-Verification/Creation):', {
        id: activeLaunchWorkflow.id,
        status: activeLaunchWorkflow.status, // Check the status *here*
        currentStepId: activeLaunchWorkflow.currentStepId 
    });

    // Check if the workflow is active *before* proceeding
    if (activeLaunchWorkflow.status !== WorkflowStatus.ACTIVE) {
         throw new Error(`Launch workflow is not ACTIVE after verification/creation. Status: ${activeLaunchWorkflow.status}`);
    }


    // Process Launch Announcement Steps
    console.log('\n=== Processing Launch Announcement Workflow Steps ===');
    const launchSteps = [
      { message: "Achieve maximum positive press coverage for our new product.", description: "Initial Goal Assessment" },
      { message: "Product Launch", description: "Announcement Type Selection" },
      { message: "Press Release, Social Media Posts", description: "Asset Selection" },
      { message: "Yes, confirm these assets", description: "Asset Confirmation" },
      { message: "Provide information directly in chat", description: "Information Collection" },
      { message: "The generated assets look great!", description: "Asset Review" },
      { message: "Creating a media list", description: "Post-Asset Tasks" }
    ];

    for (const step of launchSteps) {
      console.log(`\n--- Processing Launch Step: ${step.description} ---`);
      const response = await chatService.handleUserMessage(threadId, step.message);
      console.log(`${step.description} Response:`, response);

      // Verify step completion after each message
      const currentWorkflowState = await workflowService.getWorkflow(activeLaunchWorkflow.id);
      const completedStep = currentWorkflowState?.steps.find(s => s.name === step.description);
      
      console.log(`State after "${step.description}":`, {
        stepId: completedStep?.id,
        stepStatus: completedStep?.status,
        stepUserInput: completedStep?.userInput,
        workflowStatus: currentWorkflowState?.status,
        currentStepId: currentWorkflowState?.currentStepId
      });

      if (!completedStep || completedStep.status !== StepStatus.COMPLETE) {
         const pendingStep = currentWorkflowState?.steps.find(s => s.id === currentWorkflowState?.currentStepId);
         console.error(`Failed verification for step: "${step.description}"`);
        throw new Error(`Launch Step "${step.description}" (ID: ${completedStep?.id}) did not complete properly. Status found: ${completedStep?.status}. Workflow status: ${currentWorkflowState?.status}. Current pending step: ${pendingStep?.name} (ID: ${pendingStep?.id})`);
      }
      
      if (completedStep.userInput !== step.message) {
           console.warn(`User input mismatch for step "${step.description}". Expected: "${step.message}", Got: "${completedStep.userInput}"`);
       }
    }

    // Verify final Launch Announcement Workflow completion
    const finalLaunch = await workflowService.getWorkflow(activeLaunchWorkflow.id);
    console.log('\nLaunch Announcement workflow final state:', { status: finalLaunch?.status });
    if (finalLaunch?.status !== WorkflowStatus.COMPLETED) {
      const finalSteps = await db.query.workflowSteps.findMany({ where: eq(workflowSteps.workflowId, activeLaunchWorkflow.id), orderBy: asc(workflowSteps.order) });
      console.error('Final Launch Steps State:', finalSteps.map(s => ({ name: s.name, status: s.status })));
      throw new Error('Launch Announcement workflow not marked as completed');
    }

    console.log('\n=== Test Completed Successfully ===\n');
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Run the test
runBaseThenLaunchTest().catch(console.error); 