import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { WorkflowService } from "./workflow.service";
import { workflowContextService } from "./workflowContext.service";
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
    
    // === UNIVERSAL AI-DRIVEN WORKFLOW SWITCHING ===
    try {
      // Get current workflow name for context with enhanced resolution
      let currentWorkflowName = this.getWorkflowNameFromTemplateId(workflow.templateId);
      
      // Enhanced fallback resolution for current workflow name
      if (!currentWorkflowName) {
        if (workflow.templateId === '00000000-0000-0000-0000-000000000012') {
          currentWorkflowName = 'FAQ';
        } else if (workflow.templateId === '00000000-0000-0000-0000-000000000011') {
          currentWorkflowName = 'Blog Article';
        } else if (workflow.templateId === '00000000-0000-0000-0000-000000000010') {
          currentWorkflowName = 'Social Post';
        } else if (workflow.templateId === '00000000-0000-0000-0000-000000000008') {
          currentWorkflowName = 'Press Release';
        } else if (currentStep?.name?.includes('FAQ') || currentStep?.description?.includes('FAQ')) {
          currentWorkflowName = 'FAQ';
        } else if (currentStep?.name?.includes('Blog') || currentStep?.description?.includes('blog')) {
          currentWorkflowName = 'Blog Article';
        } else {
          currentWorkflowName = 'Unknown Workflow';
        }
      }
      
      logger.debug('Universal workflow switching - current workflow resolution', {
        templateId: workflow.templateId,
        resolvedWorkflowName: currentWorkflowName,
        stepName: currentStep?.name,
        userInput: content.substring(0, 50)
      });
      
      // SECURITY CHECK: Only attempt AI switching if current workflow allows it
      if (!workflowContextService.isAISwitchingEnabled(currentWorkflowName)) {
        const securityConfig = workflowContextService.getWorkflowSecurityConfig(currentWorkflowName);
        logger.info(`Skipping AI workflow switching for security-restricted workflow: ${currentWorkflowName} (${securityConfig?.security_level})`, {
          reason: securityConfig?.reason || 'Security restrictions apply',
          templateId: workflow.templateId,
          stepName: currentStep?.name
        });
        
        // For restricted workflows, proceed directly to enhanced processing without AI switching
        // This ensures sensitive workflows maintain their rigid structure
      } else {
        logger.debug('Analyzing workflow switch intent', {
          currentWorkflow: currentWorkflowName,
          currentStep: currentStep?.name,
          userInput: content,
          isAISwitchingEnabled: true,
          securityLevel: workflowContextService.getWorkflowSecurityConfig(currentWorkflowName)?.security_level || 'unknown'
        });
        
        // Use universal AI-driven intent detection (only for AI-safe workflows)
        const switchAnalysis = await workflowContextService.analyzeWorkflowSwitchIntent(
          content,
          currentWorkflowName,
          currentStep?.name || 'Unknown Step'
        );
        
        logger.info('Workflow switch analysis result', {
          currentWorkflow: currentWorkflowName,
          shouldSwitch: switchAnalysis.shouldSwitch,
          targetWorkflow: switchAnalysis.targetWorkflow,
          confidence: switchAnalysis.confidence,
          reasoning: switchAnalysis.reasoning
        });
        
        // Handle workflow switch intents with high confidence
        if (switchAnalysis.shouldSwitch && switchAnalysis.confidence > 0.7 && switchAnalysis.targetWorkflow) {
          // SECURITY CHECK: Ensure target workflow is also AI-safe
          const targetSecurityConfig = workflowContextService.getWorkflowSecurityConfig(switchAnalysis.targetWorkflow);
          
          if (workflowContextService.isAISwitchingEnabled(switchAnalysis.targetWorkflow)) {
            try {
              logger.info('Executing universal workflow switch', {
                fromWorkflow: currentWorkflowName,
                fromSecurityLevel: workflowContextService.getWorkflowSecurityConfig(currentWorkflowName)?.security_level,
                toWorkflow: switchAnalysis.targetWorkflow,
                toSecurityLevel: targetSecurityConfig?.security_level,
                confidence: switchAnalysis.confidence
              });
              
              // Execute the universal workflow switch
              const switchResult = await this.workflowService.executeWorkflowSwitch(
                workflow.id,
                switchAnalysis.targetWorkflow,
                true // Transfer data
              );
              
              if (switchResult.success && switchResult.newWorkflow) {
                // Add success message with reasoning
                const successMessage = `✅ Successfully switched to ${switchAnalysis.targetWorkflow}! ${switchAnalysis.reasoning}`;
                await this.addMessage(threadId, successMessage, false);
                
                // Create debug data for frontend
                const debugData = {
                  workflowSwitchDetected: true,
                  targetWorkflow: switchAnalysis.targetWorkflow,
                  confidence: switchAnalysis.confidence,
                  reasoning: switchAnalysis.reasoning,
                  method: 'pattern-match',
                  switchMethod: 'pattern',
                  patternMatched: 'direct command'
                };
                
                // Get the first prompt from the new workflow
                const nextPrompt = await this.getNextPrompt(threadId, switchResult.newWorkflow.id);
                
                // Return response with debug data
                return {
                  response: nextPrompt,
                  ...debugData
                };
              } else {
                logger.warn('Universal workflow switch failed:', switchResult);
              }
            } catch (error) {
              logger.error('Error in universal workflow switch:', error);
            }
          } else {
            // Target workflow is security-restricted
            const restrictedMessage = `I detected you want to switch to ${switchAnalysis.targetWorkflow}, but that workflow has security restrictions (${targetSecurityConfig?.security_level}) that prevent automatic switching. ${targetSecurityConfig?.reason || 'Security protocols apply.'}`;
            await this.addMessage(threadId, restrictedMessage, false);
            return restrictedMessage;
          }
        }
        
        // Handle moderate confidence switch intents by offering options (only AI-safe workflows)
        if (switchAnalysis.shouldSwitch && switchAnalysis.confidence > 0.5) {
          const availableWorkflows = workflowContextService.getAISafeWorkflows()
            .filter(w => w.name !== currentWorkflowName)
            .slice(0, 4) // Show top 4 options
            .map(w => w.name)
            .join(', ');
          
          const clarificationMessage = `I detected you might want to switch workflows. ${switchAnalysis.reasoning}. ` +
            `Available options: ${availableWorkflows}. ` +
            `Would you like to switch to a specific workflow, or continue with ${currentWorkflowName}?`;
          
          await this.addMessage(threadId, clarificationMessage, false);
          return clarificationMessage;
        }
      }
      
    } catch (error) {
      logger.error('Error in universal workflow switching detection:', error);
      // Continue to enhanced processing
    }
    
    // Handle the step response using enhanced processing with intent detection
    const stepResponse = await this.workflowService.handleStepResponseEnhanced(currentStepId, content);
    
    // Check if JSON parsing detected a workflow switch intent (check multiple possible locations for the switch data)
    let workflowSwitchData = (stepResponse as any).workflowSwitchDetected;
    
    // Also check if it's nested in the response or other possible locations
    if (!workflowSwitchData && stepResponse.response) {
      // Sometimes the switch data might be in the raw response
      try {
        const responseObj = typeof stepResponse.response === 'string' ? JSON.parse(stepResponse.response) : stepResponse.response;
        workflowSwitchData = responseObj.workflowSwitchDetected;
      } catch (error) {
        // Response is not JSON, continue
      }
    }
    
    // Also check the enhancedResponse structure
    if (!workflowSwitchData && stepResponse.enhancedResponse) {
      workflowSwitchData = (stepResponse.enhancedResponse as any).workflowSwitchDetected;
    }
    
    logger.debug('Checking for workflow switch data in step response', {
      hasWorkflowSwitchData: !!workflowSwitchData,
      stepResponseKeys: Object.keys(stepResponse),
      workflowSwitchData: workflowSwitchData ? {
        targetWorkflow: workflowSwitchData.targetWorkflow,
        confidence: workflowSwitchData.confidence
      } : null
    });
    
    if (workflowSwitchData && workflowSwitchData.targetWorkflow) {
      const { targetWorkflow, confidence, reasoning } = workflowSwitchData;
      
      logger.info('Processing AI-detected workflow switch from JSON response', {
        currentWorkflow: this.getWorkflowNameFromTemplateId(workflow.templateId) || 'Unknown Workflow',
        targetWorkflow,
        confidence,
        reasoning
      });
      
      // Check if target workflow is AI-safe
      if (workflowContextService.isAISwitchingEnabled(targetWorkflow)) {
        try {
          // Execute the workflow switch
          const switchResult = await this.workflowService.executeWorkflowSwitch(
            workflow.id,
            targetWorkflow,
            true // Transfer data
          );
          
          if (switchResult.success && switchResult.newWorkflow) {
            // Add success message with reasoning
            const successMessage = `✅ Successfully switched to ${targetWorkflow}! ${reasoning}`;
            await this.addMessage(threadId, successMessage, false);
            
            // Create debug data for frontend
            const debugData = {
              workflowSwitchDetected: true,
              targetWorkflow: targetWorkflow,
              confidence: confidence,
              reasoning: reasoning,
              method: 'ai-detection',
              switchMethod: 'ai',
              aiDetection: {
                confidence: confidence,
                reasoning: reasoning
              }
            };
            
            // Get the first prompt from the new workflow
            const nextPrompt = await this.getNextPrompt(threadId, switchResult.newWorkflow.id);
            
            // Return response with debug data
            return {
              response: nextPrompt,
              ...debugData
            };
          } else {
            logger.warn('AI-detected workflow switch failed:', switchResult);
            // Fall through to normal processing
          }
        } catch (error) {
          logger.error('Error in AI-detected workflow switch:', error);
          // Fall through to normal processing
        }
      } else {
        // Target workflow is security-restricted
        const restrictedMessage = `I detected you want to switch to ${targetWorkflow}, but that workflow has security restrictions that prevent automatic switching. Please start a new conversation for ${targetWorkflow}.`;
        await this.addMessage(threadId, restrictedMessage, false);
        return restrictedMessage;
      }
    }
    
    // Check if the enhanced response indicates a workflow switch request
    if (stepResponse.enhancedResponse?.type === 'normal' && stepResponse.response.includes('Would you like me to switch')) {
      // This is a workflow switch confirmation request - add the message and wait for confirmation
      await this.addMessage(threadId, stepResponse.response, false);
      return stepResponse.response;
    }
    
    // Handle enhanced workflow switching scenarios
    if (stepResponse.workflowSwitchSuggested) {
      // User wants to switch workflows - add the suggestion message
      await this.addMessage(threadId, stepResponse.response, false);
      
      // For now, just present the options. In the future, you could add buttons/UI for switching
      return stepResponse.response;
    }
    
    // Handle workflow switch confirmation
    if (stepResponse.enhancedResponse && stepResponse.enhancedResponse.type === 'workflow_switch_request') {
      await this.addMessage(threadId, stepResponse.response, false);
      return stepResponse.response;
    }
    
    // Check if this is a confirmation for a workflow switch
    if (stepResponse.enhancedResponse?.type === 'normal' && content.toLowerCase().includes('switch') || 
        content.toLowerCase().includes('yes') && stepResponse.response.includes('Social Post')) {
      
      try {
        // Execute the workflow switch
        const switchResult = await this.workflowService.executeWorkflowSwitch(
          workflow.id,
          'Social Post', // Target workflow - could be extracted from context
          true // Transfer data
        );
        
        if (switchResult.success && switchResult.newWorkflow) {
          // Add success message
          await this.addMessage(threadId, switchResult.message, false);
          
          // Get the first prompt from the new workflow
          return this.getNextPrompt(threadId, switchResult.newWorkflow.id);
        } else {
          // Switch failed
          await this.addMessage(threadId, switchResult.message, false);
          return switchResult.message;
        }
      } catch (error) {
        const errorMsg = "I had trouble switching workflows. Let's try continuing with the current workflow or starting fresh.";
        await this.addMessage(threadId, errorMsg, false);
        return errorMsg;
      }
    }
    
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

  private getWorkflowNameFromTemplateId(templateId: string): string | undefined {
    const workflowName = workflowContextService.getWorkflowNameByTemplateId(templateId);
    logger.debug('Mapping template ID to workflow name', {
      templateId,
      workflowName: workflowName || 'undefined',
      availableWorkflows: workflowContextService.getAvailableWorkflows()
    });
    return workflowName;
  }
}