import { randomUUID } from 'crypto';
import { sql, eq } from 'drizzle-orm';
import { db } from '../db';
import { chatThreads, chatMessages } from '../db/schema';
import { enhancedWorkflowService } from './enhanced-workflow.service';
import { WorkflowStatus, StepStatus, StepType, WorkflowStep } from '../types/workflow';
import { BASE_WORKFLOW_TEMPLATE } from '../templates/workflows/base-workflow.js';
import { simpleCache } from '../utils/simpleCache';
import { MessageContentHelper } from '../types/chat-message';
import { IntentClassificationService, UserIntent, IntentContext } from './intent-classification.service';
import { ragService } from './ragService';
import logger from '../utils/logger';

export class ChatService {
  private workflowService: typeof enhancedWorkflowService; // Updated type
  private intentService: IntentClassificationService;

  constructor() {
    this.workflowService = enhancedWorkflowService; // Changed from enhancedWorkflowService
    this.intentService = new IntentClassificationService();
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

      // Create the workflow silently for initial thread creation (no initial prompt needed)
      await this.workflowService.createWorkflow(thread.id, baseTemplate.id, true);
      console.log(`Base workflow created silently for new thread ${thread.id}`);
      
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

  /**
   * Detect asset type from content to determine if structured messaging should be used
   */
  private detectAssetType(content: string): string | null {
    // Exclude workflow prompts and step messages from being treated as assets
    if (content.includes('Please review it and let me know') ||
        content.includes('Please review the') ||
        content.includes('What would you like to do with') ||
        content.includes('Moving to the next step') ||
        content.includes('Great! Moving to') ||
        content.includes('Let me know if you') ||
        content.includes('What would you like to work on next') ||
        content.includes('**Full Workflows:**') ||
        content.includes('**Quick Asset Creation:**') ||
        content.includes('I can help you with:') ||
        content.length < 200) { // Most workflow prompts are short
      return null;
    }
    
    // Check for press releases
    if (content.includes('FOR IMMEDIATE RELEASE') || 
        content.includes('Press Release') ||
        content.includes('**Contact:') ||
        (content.includes('**') && content.length > 500)) {
      return 'Press Release';
    }
    
    // Check for media pitch
    if (content.includes('Subject:') && content.includes('Hi ') && content.length > 200) {
      return 'Media Pitch';
    }
    
    // Check for social posts (shorter content with hashtags or social language)
    if ((content.includes('#') || content.includes('@') || 
         content.toLowerCase().includes('social')) && content.length < 500) {
      return 'Social Post';
    }
    
    // Check for blog articles (long-form content)
    if (content.length > 1000 && 
        (content.includes('##') || content.includes('Introduction') || 
         content.toLowerCase().includes('blog') || content.toLowerCase().includes('article'))) {
      return 'Blog Article';
    }
    
    // Check for FAQ format
    if (content.includes('Q:') || content.includes('Question:') || 
        content.toLowerCase().includes('frequently asked')) {
      return 'FAQ';
    }
    
    // Check for media lists
    if (content.includes('Media Contacts') || content.includes('**Outlet:')) {
      return 'Media List';
    }
    
    // If it's long-form content but doesn't match specific patterns, it's likely an asset
    if (content.length > 500) { // Increased threshold to avoid short prompts
      return 'Content Asset';
    }
    
    return null;
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
    type: 'message_saved' | 'workflow_status' | 'ai_response' | 'workflow_complete' | 'error' | 'intent_classified';
    data: any;
  }> {
    // Generate unique request ID for this streaming session
    const requestId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('🎯 SIMPLIFIED STREAMING: Starting unified workflow execution', {
      requestId,
      threadId: threadId.substring(0, 8),
      userInput: content.substring(0, 50),
      hasUserId: !!userId
    });

    try {
      // Save user message first
      const userMessage = await this.addMessage(threadId, content, true);
      
      yield {
        type: 'message_saved',
        data: { messageId: userMessage?.id, role: 'user', content }
      };

      // 🧠 UNIVERSAL INTENT CLASSIFICATION - Applied to ALL user messages
      logger.info('🧠 Applying universal intent classification to user input');
      
      const currentWorkflow = await this.workflowService.getWorkflowByThreadId(threadId);
      const ragContext = await this.gatherRagContext(threadId, userId, orgId);
      
      const intent = await this.classifyUserIntent(content, threadId, currentWorkflow, ragContext);
      
      yield {
        type: 'intent_classified',
        data: {
          intent: {
            category: intent.category,
            action: intent.action,
            workflowName: intent.workflowName,
            confidence: intent.confidence,
            reasoning: intent.reasoning
          }
        }
      };

      // Use enhanced service streaming with intent-aware processing
      logger.info('🎯 Using Enhanced Service streaming with intent-aware workflow state preparation');

      // Track accumulated content for streaming
      let accumulatedContent = '';
      
      // Get current step or null if no active workflow
      const currentStepId = await this.getCurrentStepForThread(threadId);
      
      // Determine which step ID to use
      let effectiveStepId = currentStepId;
      
      // If no active workflow exists, create a new Base Workflow
      if (!currentStepId) {
        logger.info('🔄 No active workflow found - creating new Base Workflow', {
          threadId: threadId.substring(0, 8),
          userInput: content.substring(0, 50)
        });
        const newWorkflow = await this.workflowService.createWorkflow(threadId, '00000000-0000-0000-0000-000000000000', false);
        effectiveStepId = newWorkflow.steps.find((step: any) => step.order === 0)?.id || null;
        
        logger.info('✅ Created new Base Workflow', {
          workflowId: newWorkflow.id.substring(0, 8),
          effectiveStepId: effectiveStepId?.substring(0, 8),
          stepName: newWorkflow.steps.find((step: any) => step.order === 0)?.name
        });
      }
      
      // Ensure we have a valid step ID before proceeding
      if (!effectiveStepId) {
        logger.error('❌ No valid step ID found - cannot proceed with streaming');
        yield {
          type: 'error',
          data: { message: 'No valid workflow step found' }
        };
        return;
      }
      
      // Pass intent context to the enhanced workflow service
      for await (const chunk of this.workflowService.handleStepResponseStreamWithContext(
        effectiveStepId,
        content,
        userId || '',
        orgId || '',
        { intent } // Pass the classified intent to guide response generation
      )) {
        if (chunk.type === 'content') {
          // Accumulate the content
          if (chunk.data.content) {
            accumulatedContent += chunk.data.content;
          }
          
          yield {
            type: 'ai_response',
            data: {
              ...chunk.data,
              accumulated: accumulatedContent  // Send both latest chunk AND accumulated total
            }
          };
        } else if (chunk.type === 'metadata') {
          // Handle workflow transitions
          if (chunk.data.workflowTransition) {
            logger.info('🔄 Processing workflow transition', {
              requestId,
              from: 'Base Workflow',
              to: chunk.data.workflowTransition.workflowName,
              templateId: chunk.data.workflowTransition.newWorkflowId
            });
            
            yield {
              type: 'workflow_status',
              data: {
                status: 'transitioning',
                workflowTransition: chunk.data.workflowTransition
              }
            };
          }
        } else if (chunk.type === 'error') {
          yield {
            type: 'error',
            data: chunk.data
          };
        } else if (chunk.type === 'done') {
          // Save the final accumulated response with proper structured messaging
          if (chunk.data.finalResponse) {
            // Check if this looks like an Asset Generation response that should use structured messaging
            const assetType = this.detectAssetType(chunk.data.finalResponse);
            
            if (assetType) {
              // Check if a similar asset message already exists to prevent duplicates
              const recentMessages = await db.query.chatMessages.findMany({
                where: eq(chatMessages.threadId, threadId),
                orderBy: (messages, { desc }) => [desc(messages.createdAt)],
                limit: 10, // Check recent messages
              });
              
              // Check if there's already a structured asset message with similar content
              const existingAssetMessage = recentMessages.find(msg => {
                if (msg.content && typeof msg.content === 'string' && msg.content.startsWith('{')) {
                  try {
                    const parsedContent = JSON.parse(msg.content);
                    return parsedContent.type === 'asset' && 
                           parsedContent.text && 
                           parsedContent.text.length > 500; // Existing asset content
                  } catch (e) {
                    return false;
                  }
                }
                return false;
              });
              
              if (existingAssetMessage) {
                logger.info('💾 Enhanced streaming: Skipping duplicate asset message - similar content already exists', {
                  assetType,
                  existingMessageId: existingAssetMessage.id
                });
              } else {
                // Use structured asset messaging for Asset Generation responses
                const currentStepId = await this.getCurrentStepForThread(threadId);
                
                // Only add structured asset message if we have a valid step ID
                if (currentStepId) {
                  // Call Enhanced Workflow Service to add asset message
                  await this.workflowService.addAssetMessage(
                    threadId,
                    chunk.data.finalResponse,
                    assetType,
                    currentStepId,
                    'Asset Generation'
                  );
                  
                  logger.info('💾 Enhanced streaming: Asset message saved with structured content', {
                    assetType,
                    responseLength: chunk.data.finalResponse.length
                  });
                } else {
                  // No active workflow - use regular message
                  const aiMessage = await this.addMessage(threadId, chunk.data.finalResponse, false);
                  logger.info('💾 Enhanced streaming: No active workflow - saved as regular message', {
                    messageId: aiMessage?.id,
                    responseLength: chunk.data.finalResponse.length
                  });
                }
              }
              
            } else {
              // Use structured message for non-asset steps (workflow selection, etc.)
              const structuredContent = MessageContentHelper.createTextMessage(chunk.data.finalResponse);
              
              const [aiMessage] = await db.insert(chatMessages).values({
                threadId,
                content: JSON.stringify(structuredContent),
                role: "assistant",
                userId: "system",
              }).returning();
              
              logger.info('💾 Enhanced streaming: Final AI message saved with structured content', {
                messageId: aiMessage?.id,
                responseLength: chunk.data.finalResponse.length,
                messageType: 'structured_text'
              });
            }
          }
          
          yield {
            type: 'workflow_complete',
            data: { success: true }
          };
          break;
        }
      }

    } catch (error) {
      logger.error('❌ Enhanced Streaming Failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        threadId
      });
      
      yield {
        type: 'error',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Keep the original complex method as backup during transition
  async* handleUserMessageStreamOld(
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

      // Check if user is asking for general help/workflow selection  
      const isGeneralHelpRequest = this.isGeneralHelpRequest(content);
      let currentStepForCheck = workflow?.steps?.find((step: any) => step.id === workflow?.currentStepId);
      
      // If user is asking for general help and we're not on the Workflow Selection step, restart the workflow
      if (workflow && isGeneralHelpRequest && currentStepForCheck?.name !== "Workflow Selection") {
        console.log(`🔄 CHAT SERVICE: Detected general help request while on step "${currentStepForCheck?.name}". Restarting workflow selection.`);
        
        // Complete the current workflow
        await this.workflowService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
        
        // Create a new base workflow (not silent - we want the workflow selection step active)
        const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
        if (!baseTemplate) throw new Error("Base workflow template not found");
        
        workflow = await this.workflowService.createWorkflow(threadId, baseTemplate.id, false);
        console.log(`✅ CHAT SERVICE: Restarted base workflow for general help request. New workflow: ${workflow.id}`);
        
        yield {
          type: 'workflow_status',
          data: { status: 'workflow_restarted', workflowId: workflow.id }
        };
      }

      // Process the current step
      const currentStepId = workflow.currentStepId;
      if (!currentStepId) {
        console.warn(`Workflow ${workflow.id} has no currentStepId. Looking for first IN_PROGRESS step.`);
        
        // Find the first IN_PROGRESS step (should be the first step we just created)
        const inProgressStep = workflow.steps.find(step => step.status === StepStatus.IN_PROGRESS);
        if (inProgressStep) {
          console.log(`✅ Found IN_PROGRESS step: ${inProgressStep.name} (${inProgressStep.id})`);
          // Update the workflow's currentStepId to this step
          await this.workflowService.updateWorkflowCurrentStep(workflow.id, inProgressStep.id);
          // Continue processing with this step
          workflow.currentStepId = inProgressStep.id;
        } else {
          console.warn(`No IN_PROGRESS step found. Falling back to getNextPrompt.`);
          const prompt = await this.getNextPrompt(threadId, workflow.id);
          
          yield {
            type: 'ai_response',
            data: { content: prompt, isComplete: true }
          };
          return;
        }
      }

      // Get the current step before processing
      const currentStep = workflow.steps.find(step => step.id === workflow.currentStepId);
      
      // Handle streaming step response using enhanced context if user info is available
      const stepResponseGenerator = userId && orgId 
        ? this.workflowService.handleStepResponseStreamWithContext(workflow.currentStepId!, content, userId, orgId)
        : this.workflowService.handleStepResponseStream(workflow.currentStepId!, content);

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
        // Check if enhanced service indicated to skip original processing
        if (stepResponse?.skipOriginalProcessing) {
          console.log(`🔇 Step ${currentStepId} processed by enhanced service - skipping getNextPrompt fallback.`);
          // Enhanced service already handled everything, no additional processing needed
          return;
        }
        
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

  // Check if user input is a general help request that should restart workflow selection
  private isGeneralHelpRequest(content: string): boolean {
    const lowerContent = content.toLowerCase().trim();
    
    // Common patterns for general help requests
    const helpPatterns = [
      'what can i do',
      'what can you do',
      'what are my options',
      'help',
      'options',
      'menu',
      'workflows',
      'what workflows',
      'list workflows',
      'available workflows'
    ];
    
    // Single character or very short inputs that suggest confusion
    const isVeryShort = content.trim().length <= 2;
    
    // Check if any help pattern matches
    const matchesHelpPattern = helpPatterns.some(pattern => lowerContent.includes(pattern));
    
    return matchesHelpPattern || isVeryShort;
  }

  /**
   * Get current step for thread (helper for enhanced service integration)
   */
  private async getCurrentStepForThread(threadId: string): Promise<string | null> {
    try {
      // Get workflow from enhanced service
      const workflowFromDB = await this.workflowService.getWorkflowByThreadId(threadId);
      
      if (workflowFromDB?.currentStepId) {
        return workflowFromDB.currentStepId;
      }
      
      // If no current step, find the first step
      const firstStep = workflowFromDB?.steps?.find((step: any) => step.order === 0);
      if (firstStep) {
        return firstStep.id;
      }
      
      // If no active workflow exists, return null - enhanced service will create new Base Workflow
      return null;
      
    } catch (error) {
      logger.error('Error getting current step for thread', {
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Enhanced service will handle workflow/step creation
      return null;
    }
  }

  /**
   * Universal Intent Classification for all user messages
   */
  private async classifyUserIntent(
    userMessage: string,
    threadId: string,
    currentWorkflow?: any,
    ragContext?: any
  ): Promise<UserIntent> {
    try {
      const intentContext: IntentContext = {
        userMessage,
        conversationHistory: this.extractConversationHistory(ragContext),
        currentWorkflow: currentWorkflow ? {
          name: this.getWorkflowDisplayName(currentWorkflow) || 'Unknown',
          currentStep: this.getCurrentStepName(ragContext) || 'Unknown',
          status: currentWorkflow.status || 'unknown'
        } : undefined,
        userProfile: ragContext?.userDefaults,
        availableWorkflows: this.intentService.getAvailableWorkflows()
      };

      return await this.intentService.classifyIntent(intentContext);
    } catch (error) {
      logger.error('Intent classification failed, using fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        threadId: threadId.substring(0, 8),
        userMessage: userMessage.substring(0, 50)
      });

      // Fallback to conversational intent
      return {
        category: 'conversational',
        action: 'general_conversation',
        confidence: 0.3,
        reasoning: 'Fallback due to classification error'
      };
    }
  }

  /**
   * Gather RAG context for intent classification
   */
  private async gatherRagContext(threadId: string, userId?: string, orgId?: string): Promise<any> {
    if (!userId || !orgId) return null;

    try {
      // Use the RAG service to get relevant context for intent classification
      return await ragService.getRelevantContext(userId, orgId, 'intent_classification', 'classification', 'intent context');
    } catch (error) {
      logger.warn('Failed to gather RAG context for intent classification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        threadId: threadId.substring(0, 8)
      });
      return null;
    }
  }

  /**
   * Get display name for workflow from various sources
   */
  private getWorkflowDisplayName(workflow: any): string | null {
    // Try template name first, then fall back to template ID mapping
    if (workflow.templateName) return workflow.templateName;
    
    // Map template IDs to display names
    const templateIdMap: Record<string, string> = {
      '00000000-0000-0000-0000-000000000008': 'Press Release',
      '00000000-0000-0000-0000-000000000010': 'Social Post',
      '00000000-0000-0000-0000-000000000011': 'Blog Article',
      '00000000-0000-0000-0000-000000000009': 'Media Pitch',
      '00000000-0000-0000-0000-000000000012': 'FAQ',
      '00000000-0000-0000-0000-000000000002': 'Launch Announcement',
      '00000000-0000-0000-0000-000000000003': 'JSON Dialog PR Workflow'
    };
    
    return templateIdMap[workflow.templateId] || null;
  }

  /**
   * Get current step name from RAG context
   */
  private getCurrentStepName(ragContext?: any): string | null {
    // Try to extract from workflow state in RAG context
    const workflowState = ragContext?.sources?.find((s: any) => s.type === 'workflow_state');
    if (workflowState?.snippet) {
      const match = workflowState.snippet.match(/Step: ([^-]+)/);
      if (match) return match[1].trim();
    }
    return null;
  }

  /**
   * Extract conversation history from RAG context
   */
  private extractConversationHistory(ragContext?: any): string[] {
    if (!ragContext?.conversationContext) return [];

    try {
      return ragContext.conversationContext
        .slice(-10) // Increased to 10 messages for better context
        .map((msg: any) => {
          let content = msg.content;
          
          // Handle structured messages that are JSON stringified
          if (typeof content === 'string' && content.startsWith('{"type"')) {
            try {
              const parsed = JSON.parse(content);
              content = parsed.text || content;
            } catch {
              // If parsing fails, use original content
            }
          }
          
          // Clean up content - remove quotes and escape sequences
          content = content
            .replace(/^\"|\"$/g, '')
            .replace(/\\"/g, '"')
            .replace(/\\n/g, ' ')
            .trim();
          
          return `${msg.role}: ${content}`;
        })
        .filter((msg: string) => msg.length > 10); // Filter out very short messages
    } catch (error) {
      logger.warn('Failed to extract conversation history from RAG context', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
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