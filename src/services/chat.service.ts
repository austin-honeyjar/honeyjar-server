import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { WorkflowService } from "./workflow.service";
import { WorkflowStatus, StepStatus, StepType } from "../types/workflow";
import { eq } from "drizzle-orm";
import { BASE_WORKFLOW_TEMPLATE } from '../templates/workflows/base-workflow.js';
import logger from "../utils/logger";

export class ChatService {
  private workflowService: WorkflowService;

  constructor() {
    this.workflowService = new WorkflowService();
  }

  async createThread(userId: string, title: string) {
    // Create the thread
    const [thread] = await db
      .insert(chatThreads)
      .values({
        userId,
        title,
      })
      .returning();

    // Immediately create and start the base workflow
    try {
      const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
      if (!baseTemplate) {
        throw new Error("Base workflow template not found");
      }

      // Create the workflow - this will automatically send the first message
      await this.workflowService.createWorkflow(thread.id, baseTemplate.id);
      console.log(`Base workflow created and initialized for thread ${thread.id}`);
      
      // Add a welcome message as the first message
      await this.addSystemMessage(thread.id, "Welcome to Honeyjar! I'm here to help you create professional PR assets. Let's get started!");
      
    } catch (error) {
      console.error(`Error initializing base workflow for thread ${thread.id}:`, error);
      // Don't throw the error as we still want to return the thread
    }

    return thread;
  }

  async addMessage(threadId: string, content: string, isUser: boolean) {
    // Check for duplicates for assistant messages
    if (!isUser) {
      const recentMessages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 3, // Check the 3 most recent messages
      });
      
      // Check if the exact same message exists
      const isDuplicate = recentMessages.some(msg => 
        msg.role === "assistant" && 
        msg.content === content
      );
      
      if (isDuplicate) {
        console.log(`ChatService: Skipping duplicate assistant message: "${content.substring(0, 50)}..."`);
        return recentMessages.find(msg => msg.role === "assistant" && msg.content === content) || null;
      }
    }
    
    // Add the message
    const [message] = await db
      .insert(chatMessages)
      .values({
        threadId,
        content,
        role: isUser ? "user" : "assistant",
        userId: isUser ? threadId : "system",
      })
      .returning();
    return message;
  }

  async getThreadMessages(threadId: string) {
    return db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    });
  }

  async handleUserMessage(threadId: string, content: string) {
    // Check if this message already exists in the database
    const recentMessages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit: 5, // Get the 5 most recent messages
    });
    
    // Check if there's already a user message with this content
    const duplicateMessage = recentMessages.find(msg => 
      msg.role === "user" && 
      msg.content === content
    );
    
    // Only add the message if it doesn't already exist
    if (!duplicateMessage) {
      console.log(`Adding new user message to thread ${threadId}: "${content.substring(0, 30)}..."`);
      await this.addMessage(threadId, content, true);
    } else {
      console.log(`Skipping duplicate user message in thread ${threadId}: "${content.substring(0, 30)}..."`);
    }

    // Get the active workflow for this thread
    let workflow = await this.workflowService.getWorkflowByThreadId(threadId);
    if (!workflow) {
      // If no workflow exists at all, something went wrong during thread creation
      // Create the base workflow as a fallback
      console.warn(`No workflow found for thread ${threadId}. Creating base workflow as fallback.`);
      const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
      if (!baseTemplate) throw new Error("Base workflow template not found");
      
      workflow = await this.workflowService.createWorkflow(threadId, baseTemplate.id);
    }

    // If we have an active workflow, process the current step
    const currentStepId = workflow.currentStepId;
    if (!currentStepId) {
      console.warn(`Workflow ${workflow.id} has no currentStepId. Attempting to get next prompt.`);
      return this.getNextPrompt(threadId, workflow.id);
    }

    // Get the current step before processing
    const currentStep = workflow.steps.find(step => step.id === currentStepId);
    
    // Handle the step response using the current step ID
    const stepResponse = await this.workflowService.handleStepResponse(currentStepId, content);
    
    // Add AI response to thread if provided by handleStepResponse
    if (stepResponse.response && stepResponse.response !== 'Workflow completed successfully.') { 
      await this.addMessage(threadId, stepResponse.response, false);
    }

    // Check if the *workflow* completed as a result of this step
    if (stepResponse.isComplete) {
        // Delegate workflow completion and transitions to workflow service
        const completionResult = await this.workflowService.handleWorkflowCompletion(workflow, threadId);
        
        if (completionResult.newWorkflow) {
          // Add a message to show which workflow was selected
          const selectionMsg = `Workflow selected: ${completionResult.selectedWorkflow}`;
          await this.addWorkflowStatusMessage(threadId, selectionMsg);
          
          // Get the first prompt of the new workflow
          return this.getNextPrompt(threadId, completionResult.newWorkflow.id);
        }
        
        // Standard workflow completion
        const completionMsg = completionResult.message || `${workflow.templateId || 'Workflow'} completed successfully.`;
        const lastMessage = await this.getLastMessage(threadId);
        if (lastMessage?.content !== completionMsg) {
            await this.addWorkflowStatusMessage(threadId, completionMsg);
        }
        return completionMsg;
    } else if (stepResponse.nextStep) {
      // If the workflow is not complete, but there's a specific next step prompt from handleStepResponse
       
       // Get the next step information
       const nextStepInfo = workflow.steps.find(step => step.id === stepResponse.nextStep?.id);
       
       // Check if this next step should auto-execute
       if (nextStepInfo) {
         const autoExecCheck = await this.workflowService.checkAndHandleAutoExecution(
           nextStepInfo.id, 
           workflow.id, 
           threadId
         );

         if (autoExecCheck.autoExecuted) {
           if (autoExecCheck.nextWorkflow) {
             // Step auto-executed and triggered workflow transition
             return this.getNextPrompt(threadId, autoExecCheck.nextWorkflow.id);
           } else if (autoExecCheck.result) {
             // Step auto-executed, return the result
             return autoExecCheck.result.response || `Step "${nextStepInfo.name}" executed automatically.`;
           }
         }
       }
       
       const nextPrompt = stepResponse.nextStep.prompt || "Please provide the required information.";
       
       // Check if the initial prompt has already been sent
       const isInitialPromptAlreadySent = nextStepInfo?.metadata?.initialPromptSent === true;
       
       if (isInitialPromptAlreadySent) {
         console.log(`Skipping duplicate prompt message - initialPromptSent flag is true`);
         return nextPrompt;
       }
       
       // Add the prompt message if it's not the same as the stepResponse message already added
       if (stepResponse.response !== nextPrompt) {
         // Update the next step to mark that we've sent this prompt
         if (nextStepInfo) {
           await this.workflowService.updateStep(nextStepInfo.id, {
             metadata: { 
               ...nextStepInfo.metadata,
               initialPromptSent: true 
             }
           });
         }
         
         await this.addMessage(threadId, nextPrompt, false);
       }
       return nextPrompt;
    } else {
       // If the step isn't complete and handleStepResponse didn't provide a specific next step/prompt,
       // rely on getNextPrompt to figure out what to do (e.g., re-prompt for current step if needed)
       console.warn(`Step ${currentStepId} processed, workflow not complete, but handleStepResponse provided no next step. Calling getNextPrompt.`);
       return this.getNextPrompt(threadId, workflow.id);
    }
  }

  // Update getNextPrompt to accept workflowId
  private async getNextPrompt(threadId: string, workflowId: string): Promise<string> {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found for ID: ${workflowId}`);
    }

    let nextStep: any = null; // Use 'any' temporarily if WorkflowStep type is complex

    // Find the current step or the next pending step
    const currentStep = workflow.steps.find(step => step.id === workflow.currentStepId);

    if (currentStep && currentStep.status !== StepStatus.COMPLETE) {
        // If current step exists and is not complete, it's the next step.
        nextStep = currentStep;
    } else {
       // Find the first pending step whose dependencies are met
       const pendingSteps = workflow.steps
         .filter(step => step.status === StepStatus.PENDING)
         .sort((a, b) => a.order - b.order);

       for (const step of pendingSteps) {
         const dependenciesMet = step.dependencies.every(depName => {
           const depStep = workflow.steps.find(s => s.name === depName);
           return depStep?.status === StepStatus.COMPLETE;
         });
         if (dependenciesMet) {
           nextStep = step;
           break;
         }
       }
    }


      if (!nextStep) {
       // Check if all steps are complete
       const allStepsComplete = workflow.steps.every(step => step.status === StepStatus.COMPLETE);
       if(allStepsComplete && workflow.status !== WorkflowStatus.COMPLETED) {
           await this.workflowService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
           const workflowCompleteMsg = `${workflow.templateId || 'Workflow'} completed.`;
            await this.addWorkflowStatusMessage(threadId, workflowCompleteMsg);
           return workflowCompleteMsg;
       } else {
          const noStepsMsg = "No further steps available or dependencies not met.";
          await this.addSystemMessage(threadId, noStepsMsg);
          return noStepsMsg;
       }
    }

    // If the next step is different from current or not yet IN_PROGRESS, update status
    if (nextStep.id !== workflow.currentStepId || nextStep.status !== StepStatus.IN_PROGRESS) {
      await this.workflowService.updateStep(nextStep.id, { status: StepStatus.IN_PROGRESS });
      await this.workflowService.updateWorkflowCurrentStep(workflow.id, nextStep.id);
    }

    // Check if this step should auto-execute
    const autoExecCheck = await this.workflowService.checkAndHandleAutoExecution(
      nextStep.id, 
      workflow.id, 
      threadId
    );

    if (autoExecCheck.autoExecuted) {
      if (autoExecCheck.nextWorkflow) {
        // Step auto-executed and triggered workflow transition
        return this.getNextPrompt(threadId, autoExecCheck.nextWorkflow.id);
      } else if (autoExecCheck.result) {
        // Step auto-executed, return the result
        return autoExecCheck.result.response || `Step "${nextStep.name}" executed automatically.`;
      }
    }

    // Get the prompt and send it if needed (for non-auto-executing steps)
    const prompt = nextStep.prompt || "Please provide the required information.";
    
    // Avoid adding duplicate prompts
    const lastMessage = await this.getLastMessage(threadId);
    if (lastMessage?.content !== prompt || lastMessage?.role !== 'assistant') {
      await this.addMessage(threadId, prompt, false);
    }
    return prompt;
  }

  // Helper to get the last message 
  private async getLastMessage(threadId: string) {
     const messages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 1,
     });
     return messages[0] || null;
  }
  
  // Helper to add a system message (workflow status messages)
  private async addSystemMessage(threadId: string, content: string) {
    // System messages are specially tagged to help frontend filtering
    const formattedContent = `[System] ${content}`;
    return this.addMessage(threadId, formattedContent, false);
  }
  
  // Helper to add a workflow status message
  private async addWorkflowStatusMessage(threadId: string, content: string) {
    // Status messages are specially tagged for frontend filtering
    const formattedContent = `[Workflow Status] ${content}`;
    return this.addMessage(threadId, formattedContent, false);
  }

  // Handle user message when the message has already been created elsewhere
  async handleUserMessageNoCreate(threadId: string, content: string) {
    // Use the same logic as handleUserMessage but skip message creation
    return this.handleUserMessage(threadId, content);
  }

  /**
   * Start a new chat with the JSON PR workflow
   */
  async startJsonPrWorkflow(userId: string, orgId?: string): Promise<string> {
    try {
      logger.info(`Starting JSON PR workflow for user ${userId}`);
      
      // 1. Create a new chat thread
      const thread = await this.createThread(userId, "New Smart PR");
      
      // 2. Create a JSON workflow for the thread
      const workflowService = new WorkflowService();
      await workflowService.createJsonWorkflow(thread.id);
      
      logger.info(`JSON PR workflow started for thread ${thread.id}`);
      
      return thread.id;
    } catch (error) {
      logger.error('Error starting JSON PR workflow', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    }
  }
  
  /**
   * Process a message in a JSON PR workflow
   */
  async processJsonPrMessage(threadId: string, userId: string, content: string): Promise<any> {
    try {
      logger.info(`Processing JSON PR message in thread ${threadId}`);
      
      // 1. Save the user message
      await this.addMessage(threadId, content, true);
      
      // 2. Get the active workflow
      const workflowService = new WorkflowService();
      const workflow = await workflowService.getWorkflowByThreadId(threadId);
      
      if (!workflow) {
        throw new Error(`No active workflow found for thread ${threadId}`);
      }
      
      // 3. Process the message with the JSON workflow
      const currentStepId = workflow.currentStepId;
      
      if (!currentStepId) {
        throw new Error(`No current step found for workflow ${workflow.id}`);
      }
      
      const result = await workflowService.handleJsonMessage(workflow.id, currentStepId, content);
      
      // 4. Add the assistant response as a message
      await this.addMessage(threadId, result.response, false);
      
      // 5. Prepare the response with debugging information if enabled
      const { config } = await import('../config');
      const response = {
        message: result.response,
        complete: result.isComplete,
        nextStep: result.nextStep,
        ...(config.debug.enableDebugMode ? { debug: result.debug } : {})
      };
      
      return response;
    } catch (error) {
      logger.error('Error processing JSON PR message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        threadId
      });
      throw error;
    }
  }
}