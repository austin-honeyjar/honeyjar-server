import { randomUUID } from 'crypto';
import { sql, eq } from 'drizzle-orm';
import { db } from '../db';
import { chatThreads, chatMessages } from '../db/schema';
import { enhancedWorkflowService } from './enhanced-workflow.service';
import { WorkflowStatus, StepStatus, StepType, WorkflowStep } from '../types/workflow';

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

    // Start with conversational mode - no workflow created until user expresses specific intent
    console.log(`New thread ${thread.id} ready for conversational interaction`);
    // Thread titles will be generated contextually when first meaningful content is created

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
      // No workflow - use intent layer to handle conversation
      console.log(`No workflow found for thread ${threadId}. Using intent layer for conversation.`);
      return "I'm ready to help! What would you like to work on?";
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
  async handleUserMessageNoCreate(threadId: string, content: string | object, userId?: string, orgId?: string) {
    // Extract text content for processing
    const textContent = typeof content === 'string' ? content : (content as any).text || JSON.stringify(content);
    
    // Use enhanced processing with user context
    return this.processUserMessageWithContext(threadId, textContent, userId, orgId);
  }

  private async processUserMessageWithContext(threadId: string, content: string, userId?: string, orgId?: string) {
    // Use the enhanced workflow service's executeWorkflow method which handles intent analysis
    try {
      const result = await this.workflowService.executeWorkflow(threadId, content, userId, orgId);
      return result.response || 'Message processed successfully.';
    } catch (error) {
      console.error('Error in enhanced workflow execution:', error);
      return 'I encountered an error processing your message. Please try again.';
    }
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
    content: string | any, 
    userId?: string, 
    orgId?: string
  ): AsyncGenerator<{
    type: 'message_saved' | 'workflow_status' | 'ai_response' | 'workflow_complete' | 'error' | 'intent_classified' | 'done';
    data: any;
  }> {
    // Generate unique request ID for this streaming session
    const requestId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Handle both string content and structured content objects
    const contentText = typeof content === 'string' 
      ? content 
      : (content?.text || JSON.stringify(content));
    
    // Check if this is a direct workflow action (bypass intent classification)
    const isDirectWorkflowAction = typeof content === 'object' && 
      content?.type === 'workflow_action' &&
      content?.decorators?.some((d: any) => d.type === 'workflow_start');
    
    logger.info('🎯 SIMPLIFIED STREAMING: Starting unified workflow execution', {
      requestId,
      threadId: threadId.substring(0, 8),
      userInput: contentText.substring(0, 50),
      contentType: typeof content,
      isDirectWorkflowAction,
      hasUserId: !!userId
    });

    try {
      // Save user message first
      const userMessage = await this.addMessage(threadId, contentText, true);
      
      yield {
        type: 'message_saved',
        data: { messageId: userMessage?.id, role: 'user', content: contentText }
      };

      let intent: any;
      let currentWorkflow: any;
      
      if (isDirectWorkflowAction) {
        // Skip intent classification for direct workflow actions
        logger.info('🎯 DIRECT WORKFLOW ACTION: Bypassing intent classification');
        
        // Extract workflow type from the structured content
        const workflowType = content?.decorators?.find((d: any) => d.type === 'workflow_start')?.data?.workflowType;
        
        // Create a direct intent for workflow creation
        intent = {
          category: 'workflow_creation',
          action: 'start_workflow',
          workflowName: workflowType,
          confidence: 1.0,
          reasoning: 'Direct workflow action from button click'
        };
        
        currentWorkflow = null; // No existing workflow for new workflow creation
      } else {
        // 🧠 UNIVERSAL INTENT CLASSIFICATION - Applied to text-based user messages
        logger.info('🧠 Applying universal intent classification to user input');
        
        // Show thinking message to user
        yield {
          type: 'ai_response',
          data: {
            content: '_Understanding your request..._',
            isComplete: true
          }
        };
        
        currentWorkflow = await this.workflowService.getWorkflowByThreadId(threadId);
        const ragContext = await this.gatherRagContext(threadId, userId, orgId);
        
        intent = await this.classifyUserIntent(contentText, threadId, currentWorkflow, ragContext);
      }
      
      // Show intent result to user (skip for direct workflow actions)
      if (!isDirectWorkflowAction) {
        const intentMessage = this.formatIntentMessage(intent);
        yield {
          type: 'ai_response',
          data: {
            content: intentMessage,
            isComplete: true
          }
        };
      }
      
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
      
      // If no active workflow exists, use intent service to handle
      if (!currentStepId) {
        logger.info('🎯 No active workflow - delegating to intent service', {
          intentCategory: intent.category,
          intentAction: intent.action,
          workflowName: intent.workflowName,
          threadId: threadId.substring(0, 8)
        });
        
        // Use intent service to handle all intents when no active workflow
        const intentGenerator = await this.intentService.handleIntent(
          intent,
          threadId,
          contentText,
          this.workflowService,
          userId,
          orgId
        );
        
        for await (const event of intentGenerator) {
          yield event;
        }
        return;
      }

      // Check if this is a workflow management intent that should be handled by intent service
      if (intent.category === 'workflow_management' && intent.action === 'cancel_workflow') {
        logger.info('🎯 Workflow management intent detected - delegating to intent service', {
          intentAction: intent.action,
          workflowName: intent.workflowName,
          shouldExit: intent.shouldExit,
          threadId: threadId.substring(0, 8)
        });
        
        // Use intent service to handle workflow management
        const intentGenerator = await this.intentService.handleIntent(
          intent,
          threadId,
          contentText,
          this.workflowService,
          userId,
          orgId
        );
        
        for await (const event of intentGenerator) {
          yield event;
        }
        return;
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
        contentText,
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
              from: 'conversational mode',
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
            // CRITICAL FIX: Check if this is already a structured message with asset decorator
            let hasAssetDecorator = false;
            if (chunk.data.structuredMessage) {
              try {
                const structured = typeof chunk.data.structuredMessage === 'string' 
                  ? JSON.parse(chunk.data.structuredMessage) 
                  : chunk.data.structuredMessage;
                hasAssetDecorator = structured.decorators?.some((d: any) => d.type === 'asset');
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            // Only treat messages as assets if they're explicitly from Asset Generation steps OR already have asset decorators
            const isExplicitAssetStep = hasAssetDecorator ||
                                       chunk.data.stepName?.includes('Asset Generation') || 
                                       chunk.data.stepName?.includes('Asset Creation') ||
                                       chunk.data.finalResponse.includes('Here\'s your generated') ||
                                       chunk.data.finalResponse.includes('Here\'s your revised');
            
            // Never treat these as assets regardless of length
            const isNonAssetContent = chunk.data.finalResponse.includes('📰 Article Search Results') ||
                                    chunk.data.finalResponse.includes('Found articles from') ||
                                    chunk.data.finalResponse.includes('Generated Authors:') ||
                                    chunk.data.finalResponse.includes('Article Analysis Complete') ||
                                    chunk.data.finalResponse.includes('Metabase');
            
            // Debug logging for asset detection and chunk structure
            logger.info('🔍 CHAT SERVICE: Full chunk data structure', {
              chunkType: chunk.type,
              chunkDataKeys: Object.keys(chunk.data || {}),
              hasStepName: !!chunk.data.stepName,
              hasFinalResponse: !!chunk.data.finalResponse,
              hasStructuredMessage: !!chunk.data.structuredMessage,
              hasMetadata: !!chunk.data.metadata,
              chunkDataPreview: chunk.data
            });
            
            logger.info('🔍 CHAT SERVICE: Asset detection analysis', {
              hasAssetDecorator: hasAssetDecorator,
              isExplicitAssetStep: isExplicitAssetStep,
              isNonAssetContent: isNonAssetContent,
              stepName: chunk.data.stepName,
              responseLength: chunk.data.finalResponse.length,
              responsePreview: chunk.data.finalResponse.substring(0, 100) + '...',
              willCreateAsset: !!(isExplicitAssetStep && !isNonAssetContent)
            });
            
            if (isExplicitAssetStep && !isNonAssetContent) {
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
              
              // Determine asset type from step name or content
              const assetType = this.determineAssetTypeFromStep(chunk.data.stepName, chunk.data.finalResponse);
              
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
                    chunk.data.stepName || 'Asset Generation'
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
              // Check if chunk already contains a structured message (e.g., contact list)
              if (chunk.data.structuredMessage) {
                try {
                  const structuredContent = typeof chunk.data.structuredMessage === 'string' 
                    ? chunk.data.structuredMessage 
                    : JSON.stringify(chunk.data.structuredMessage);
                  
                  await this.workflowService.addDirectMessage(threadId, structuredContent);
                  
                  logger.info('💾 Enhanced streaming: Structured message saved directly', {
                    responseLength: chunk.data.finalResponse.length,
                    messageType: 'pre_structured',
                    hasDecorators: !!(chunk.data.structuredMessage?.decorators?.length),
                    decoratorTypes: chunk.data.structuredMessage?.decorators?.map((d: any) => d.type) || []
                  });
                } catch (e) {
                  // Fallback to regular text message if structured message parsing fails
                  await this.workflowService.addTextMessage(threadId, chunk.data.finalResponse);
                  
                  logger.warn('💾 Enhanced streaming: Structured message failed, saved as text', {
                    responseLength: chunk.data.finalResponse.length,
                    error: e instanceof Error ? e.message : 'Unknown error'
                  });
                }
              } else {
                // Use unified structured messaging for consistency
                await this.workflowService.addTextMessage(threadId, chunk.data.finalResponse);
                
                logger.info('💾 Enhanced streaming: Final AI message saved with unified structured messaging', {
                  responseLength: chunk.data.finalResponse.length,
                  messageType: 'unified_structured_text',
                  isNonAssetContent: isNonAssetContent,
                  skippedAssetCreation: isExplicitAssetStep
                });
              }
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
      
      // If no active workflow exists, return null - enhanced service will handle conversational mode
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
      // Use simpler context for intent classification - don't need full RAG
      const startTime = Date.now();
      const result = await ragService.getRelevantContext(userId, orgId, 'intent_classification', 'classification', 'intent context');
      const duration = Date.now() - startTime;
      
      if (duration > 1000) {
        logger.warn('⚠️ Slow RAG context gathering', {
          duration: `${duration}ms`,
          threadId: threadId.substring(0, 8)
        });
      }
      
      return result;
    } catch (error) {
      logger.warn('Failed to gather RAG context for intent classification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        threadId: threadId.substring(0, 8)
      });
      return null;
    }
  }

  /**
   * Format intent classification result for user feedback
   */
  private formatIntentMessage(intent: UserIntent): string {
    const confidenceLevel = intent.confidence >= 0.8 ? 'High' : intent.confidence >= 0.6 ? 'Medium' : 'Low';
    
    switch (intent.category) {
      case 'workflow_action':
        return `_I see you want to ${intent.workflowName ? `create a ${intent.workflowName}` : 'start a workflow'}. Let me set that up...  Confidence: (${intent.confidence})_`;
      
      case 'workflow_management':
        if (intent.action === 'cancel_workflow') {
          return `_I understand you want to ${intent.workflowName ? `switch to ${intent.workflowName}` : 'exit the current workflow'}. Processing..._`;
        } else if (intent.action === 'continue_workflow') {
          return `_I'll help you continue with your current workflow..._`;
        }
        return `_Managing your workflow..._`;
      
      case 'conversational':
        return `_I'll provide information to help answer your question..._`;
      
      default:
        return `_Processing your request..._`;
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
      '00000000-0000-0000-0000-000000000006': 'Media Matching',
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
   * Determine asset type from step name and content (explicit only)
   */
  private determineAssetTypeFromStep(stepName?: string, content?: string): string {
    if (!stepName && !content) return 'press_release';
    
    const combined = `${stepName || ''} ${content || ''}`.toLowerCase();
    
    if (combined.includes('press release')) return 'press_release';
    if (combined.includes('media pitch')) return 'media_pitch';
    if (combined.includes('social post')) return 'social_post';
    if (combined.includes('blog post') || combined.includes('blog article')) return 'blog_post';
    if (combined.includes('faq')) return 'faq';
    if (combined.includes('contact list') || combined.includes('media list')) return 'contact_list';
    
    // Default fallback
    return 'press_release';
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