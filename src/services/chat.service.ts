import { randomUUID } from 'crypto';
import { sql, eq } from 'drizzle-orm';
import { db } from '../db';
import { chatThreads, chatMessages } from '../db/schema';
import { WorkflowService } from './workflow.service';
import { enhancedWorkflowService } from './enhanced-workflow.service'; // Changed from upgradedWorkflowService
import { WorkflowStatus, StepStatus, StepType, WorkflowStep } from '../types/workflow';
import { BASE_WORKFLOW_TEMPLATE } from '../templates/workflows/base-workflow.js';
import { simpleCache } from '../utils/simpleCache';
import logger from '../utils/logger';

export class ChatService {
  private workflowService: typeof enhancedWorkflowService; // Updated type

  constructor() {
    this.workflowService = enhancedWorkflowService; // Changed from enhancedWorkflowService
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
    
    // Check if this is a newly created workflow where the initial prompt was already sent
    const recentMessages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit: 5, // Check more messages to catch workflow creation sequence
    });
    
    // Check if this exact prompt was recently sent (within last 5 messages)
    const promptAlreadySent = recentMessages.some(msg => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return msg.role === "assistant" && content === prompt;
    });
    
    // Also check if this is the first step of a workflow that was just created
    const isFirstStep = nextStep.order === 0 || nextStep.name === 'Information Collection';
    const hasRecentWorkflowCreation = recentMessages.some(msg => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return msg.role === "assistant" && (
        content.includes("workflow started") ||
        content.includes("Step \"") ||
        content.includes("Moving to")
      );
    });
    
    if (promptAlreadySent || (isFirstStep && hasRecentWorkflowCreation)) {
      console.log(`ChatService: Skipping prompt - already sent by workflow creation: "${prompt.substring(0, 50)}..."`);
      return `Workflow ready: ${prompt}`; // Return indication that workflow is ready
    }
    
    // Send the prompt if it hasn't been sent recently
    await this.addMessage(threadId, prompt, false);
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
  async handleUserMessageNoCreate(threadId: string, content: string, userId?: string, orgId?: string) {
    // Use enhanced processing with user context
    return this.processUserMessageWithContext(threadId, content, userId, orgId);
  }

  private async processUserMessageWithContext(threadId: string, content: string, userId?: string, orgId?: string) {
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
    
    // Handle the step response using enhanced context if user info is available
    const stepResponse = userId && orgId 
      ? await this.workflowService.handleStepResponseWithContext(currentStepId, content, userId, orgId)
      : await this.workflowService.handleStepResponse(currentStepId, content);
    
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
          await this.addMessage(threadId, selectionMsg, false);
          
          // If there's a next step, process it
          if (completionResult.newWorkflow.currentStepId) {
            return this.getNextPrompt(threadId, completionResult.newWorkflow.id);
          }
        }
        
        return 'Workflow completed successfully.';
    }

    // If the step isn't complete and handleStepResponse didn't provide a specific next step/prompt,
    // we may need to get the next prompt (this helps for intermediate steps)
    if (!stepResponse.nextStep && currentStep && !stepResponse.isComplete) {
      console.warn(`Step ${currentStepId} processed, workflow not complete, but handleStepResponse provided no next step. Calling getNextPrompt.`);
      return this.getNextPrompt(threadId, workflow.id);
    }

    // Return the response from the step processing
    return stepResponse.response || 'Step processed successfully.';
  }

  /**
   * Handle user message with streaming response
   * @param threadId The thread ID
   * @param content The user's message content  
   * @param userId Optional user ID for enhanced context
   * @param orgId Optional organization ID for enhanced context
   * @returns An async generator that yields streaming response chunks
   */
  async* handleUserMessageStream(
    threadId: string, 
    content: string, 
    userId?: string, 
    orgId?: string
  ): AsyncGenerator<{
    type: 'message_saved' | 'workflow_status' | 'ai_response' | 'workflow_complete' | 'error';
    data: any;
  }> {
    try {
      // First, save the user message (same logic as non-streaming)
      const recentMessages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 5,
      });
      
      const duplicateMessage = recentMessages.find(msg => 
        msg.role === "user" && msg.content === content
      );
      
      let userMessage = null;
      if (!duplicateMessage) {
        console.log(`Adding new user message to thread ${threadId}: "${content.substring(0, 30)}..."`);
        userMessage = await this.addMessage(threadId, content, true);
        
        yield {
          type: 'message_saved',
          data: { message: userMessage }
        };
      } else {
        console.log(`Skipping duplicate user message in thread ${threadId}: "${content.substring(0, 30)}..."`);
        userMessage = duplicateMessage;
        
        yield {
          type: 'message_saved', 
          data: { message: userMessage, wasDuplicate: true }
        };
      }

      // Get the active workflow for this thread
      let workflow = await this.workflowService.getWorkflowByThreadId(threadId);
      if (!workflow) {
        console.warn(`No workflow found for thread ${threadId}. Creating base workflow as fallback.`);
        const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
        if (!baseTemplate) throw new Error("Base workflow template not found");
        
        workflow = await this.workflowService.createWorkflow(threadId, baseTemplate.id);
        
        yield {
          type: 'workflow_status',
          data: { status: 'workflow_created', workflowId: workflow.id }
        };
      }

      // Process the current step
      const currentStepId = workflow.currentStepId;
      if (!currentStepId) {
        console.warn(`Workflow ${workflow.id} has no currentStepId. Attempting to get next prompt.`);
        const prompt = await this.getNextPrompt(threadId, workflow.id);
        
        yield {
          type: 'ai_response',
          data: { content: prompt, isComplete: true }
        };
        return;
      }

      // Get the current step before processing
      const currentStep = workflow.steps.find(step => step.id === currentStepId);
      
      // Handle streaming step response using enhanced context if user info is available
      const stepResponseGenerator = userId && orgId 
        ? this.workflowService.handleStepResponseStreamWithContext(currentStepId, content, userId, orgId)
        : this.workflowService.handleStepResponseStream(currentStepId, content);

      let stepResponse: any = null;
      let accumulatedResponse = '';

      // Process streaming step response
      for await (const chunk of stepResponseGenerator) {
        if (chunk.type === 'content') {
          accumulatedResponse += chunk.data.content || '';
          console.log('📝 Accumulating response chunk:', {
            chunkContent: chunk.data.content,
            newAccumulatedLength: accumulatedResponse.length,
            accumulatedPreview: accumulatedResponse.substring(0, 100) + '...'
          });
          
          // Yield AI response chunks
          yield {
            type: 'ai_response',
            data: {
              content: chunk.data.content,
              isComplete: chunk.data.isComplete || false,
              accumulated: accumulatedResponse
            }
          };
        } else if (chunk.type === 'done') {
          console.log('✅ Streaming done event received:', chunk.data);
          stepResponse = chunk.data;
        } else if (chunk.type === 'error') {
          console.log('❌ Streaming error event received:', chunk.data);
          yield {
            type: 'error',
            data: chunk.data
          };
          return;
        }
      }

      // Save the accumulated AI response to the database (extract clean text from JSON)
      console.log('🔍 Checking if should save accumulated response:', {
        hasAccumulatedResponse: !!accumulatedResponse,
        accumulatedLength: accumulatedResponse.length,
        isNotWorkflowCompleted: accumulatedResponse !== 'Workflow completed successfully.',
        preview: accumulatedResponse.substring(0, 100) + '...'
      });
      
      if (accumulatedResponse && accumulatedResponse !== 'Workflow completed successfully.') {
        let finalResponse = accumulatedResponse;
        
        // If the response is JSON, extract the conversational response
        if (accumulatedResponse.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(accumulatedResponse);
            if (parsed.collectedInformation?.conversationalResponse) {
              finalResponse = parsed.collectedInformation.conversationalResponse;
              console.log('🎯 Extracted clean response for database:', finalResponse.substring(0, 50) + '...');
            } else {
              console.warn('⚠️ JSON response but no conversationalResponse found:', accumulatedResponse.substring(0, 100));
            }
          } catch (e: any) {
            console.warn('⚠️ Failed to parse JSON response for database save:', e.message);
            // Keep original response as fallback
          }
        }
        
        console.log('💾 Saving final AI response to database:', finalResponse.substring(0, 50) + '...');
        const savedMessage = await this.addMessage(threadId, finalResponse, false);
        console.log('✅ AI message saved successfully with ID:', savedMessage?.id, 'at', new Date().toISOString());
        
        // CRITICAL: Invalidate thread cache to ensure fresh data on next request
        const threadCacheKey = `thread:${threadId}`;
        simpleCache.del(threadCacheKey);
        console.log('🗑️ Invalidated thread cache for:', threadId);
      }

      // Handle workflow completion and transitions
      if (stepResponse?.isComplete) {
        const completionResult = await this.workflowService.handleWorkflowCompletion(workflow, threadId);
        
        if (completionResult.newWorkflow) {
          const selectionMsg = `Workflow selected: ${completionResult.selectedWorkflow}`;
          await this.addMessage(threadId, selectionMsg, false);
          
          yield {
            type: 'workflow_status',
            data: { 
              status: 'workflow_transition',
              selectedWorkflow: completionResult.selectedWorkflow,
              newWorkflowId: completionResult.newWorkflow.id
            }
          };
          
          // Get the first prompt of the new workflow
          const nextPrompt = await this.getNextPrompt(threadId, completionResult.newWorkflow.id);
          
          yield {
            type: 'ai_response',
            data: { content: nextPrompt, isComplete: true }
          };
        } else {
          const completionMsg = completionResult.message || `${workflow.templateId || 'Workflow'} completed successfully.`;
          await this.addWorkflowStatusMessage(threadId, completionMsg);
          
          yield {
            type: 'workflow_complete',
            data: { message: completionMsg }
          };
        }
      } else if (stepResponse?.nextStep) {
        // Handle next step processing
        const nextStepInfo = workflow.steps.find(step => step.id === stepResponse.nextStep?.id);
        
        if (nextStepInfo) {
          const autoExecCheck = await this.workflowService.checkAndHandleAutoExecution(
            nextStepInfo.id, 
            workflow.id, 
            threadId
          );

          if (autoExecCheck.autoExecuted) {
            if (autoExecCheck.nextWorkflow) {
              const nextPrompt = await this.getNextPrompt(threadId, autoExecCheck.nextWorkflow.id);
              yield {
                type: 'ai_response',
                data: { content: nextPrompt, isComplete: true }
              };
            } else if (autoExecCheck.result) {
              yield {
                type: 'ai_response',
                data: { 
                  content: autoExecCheck.result.response || `Step "${nextStepInfo.name}" executed automatically.`,
                  isComplete: true
                }
              };
            }
            return;
          }
        }
        
        const nextPrompt = stepResponse.nextStep.prompt || "Please provide the required information.";
        const isInitialPromptAlreadySent = nextStepInfo?.metadata?.initialPromptSent === true;
        
        if (!isInitialPromptAlreadySent && accumulatedResponse !== nextPrompt) {
          if (nextStepInfo) {
            await this.workflowService.updateStep(nextStepInfo.id, {
              metadata: { 
                ...nextStepInfo.metadata,
                initialPromptSent: true 
              }
            });
          }
          
          await this.addMessage(threadId, nextPrompt, false);
          
          yield {
            type: 'ai_response',
            data: { content: nextPrompt, isComplete: true }
          };
        }
      } else {
        // Fallback to getNextPrompt
        console.warn(`Step ${currentStepId} processed, workflow not complete, but handleStepResponse provided no next step. Calling getNextPrompt.`);
        const nextPrompt = await this.getNextPrompt(threadId, workflow.id);
        
        yield {
          type: 'ai_response',
          data: { content: nextPrompt, isComplete: true }
        };
      }

    } catch (error) {
      logger.error('Error in streaming message handler:', {
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      yield {
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          threadId
        }
      };
    }
  }

  // REMOVED: Legacy JSON PR workflow methods
  // These methods were only used by the removed legacy JSON PR endpoints.
  // Modern workflow creation and message processing now routes through
  // Enhanced Service via the standard /:threadId/messages endpoint.
  //
  // Removed methods:
  // - startJsonPrWorkflow() - Use standard thread creation + workflow selection
  // - processJsonPrMessage() - Use handleUserMessageNoCreate() with Enhanced Service
}