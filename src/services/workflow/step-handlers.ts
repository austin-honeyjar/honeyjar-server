import logger from '../../utils/logger';
import { Workflow, WorkflowStep, StepStatus, StepType } from '../../types/workflow';
import { WorkflowUtilities } from './workflow-utilities';
import { OpenAIService } from '../openai.service';
import { JsonDialogService } from '../jsonDialog.service';
import { EnhancedWorkflowService } from '../enhanced-workflow.service';
import { WorkflowDBService } from '../workflowDB.service';
import { IntentClassificationService } from '../intent-classification.service';

/**
 * Step Handlers
 * 
 * This file contains handlers for different types of workflow steps,
 * with enhanced RAG, context, and security integration.
 */

export class StepHandlers {
  private openAIService: OpenAIService;
  private jsonDialogService: JsonDialogService;

  constructor() {
    this.openAIService = new OpenAIService();
    this.jsonDialogService = new JsonDialogService();
  }

  /**
   * Enhanced JSON Dialog Step Handler (STREAMING VERSION)
   * 
   * Processes JSON dialog steps with RAG context, security filtering,
   * and workflow transition logic. Uses real OpenAI streaming for progressive responses.
   */
  async* handleEnhancedJsonDialogStepStream(
    step: WorkflowStep,
    workflow: Workflow,
    userInput: string,
    ragContext: any,
    userId: string,
    orgId: string
  ): AsyncGenerator<{
    type: 'content' | 'done';
    data: {
      content?: string;
      fullResponse?: string;
      finalResponse?: string;
      workflowTransition?: {
        newWorkflowId: string;
        workflowName: string;
      };
    };
  }, void, unknown> {
    try {
      logger.info('🎯 Enhanced JSON Dialog Step Processing (STREAMING)', {
        stepId: step.id.substring(0, 8),
        stepName: step.name,
        workflowId: workflow.id.substring(0, 8),
        hasRagContext: !!ragContext?.userDefaults,
        userInput: userInput.substring(0, 50)
      });

      // Check if this is a workflow selection step
      if (step.name === "Workflow Selection") {
        // Use streaming workflow selection
        yield* this.handleWorkflowSelectionStream(step, workflow, userInput, ragContext);
        return;
      }

      // Handle auto-execution for steps like "Auto Generate Thread Title"
      if (step.metadata?.autoExecute && userInput === "auto-execute") {
        // Auto-execute steps are typically fast, so we can keep them synchronous
        const result = await this.handleAutoExecuteStep(step, workflow, ragContext);
        yield {
          type: 'content',
          data: {
            content: result.response,
            fullResponse: result.response,
            finalResponse: result.response
          }
        };
        yield {
          type: 'done',
          data: {
            finalResponse: result.response
          }
        };
        return;
      }

      // For regular JSON dialog steps, use streaming OpenAI
      const enhancedPrompt = this.buildEnhancedPrompt(step, userInput, ragContext);
      
      let accumulatedResponse = '';
      
      // Check if this step expects JSON responses (like Press Release Information Collection)
      const expectsJsonResponse = step.metadata?.baseInstructions?.includes('You MUST respond with ONLY valid JSON') ||
                                  step.metadata?.baseInstructions?.includes('YOU MUST RESPOND WITH VALID JSON ONLY') ||
                                  step.metadata?.baseInstructions?.includes('MUST respond with ONLY valid JSON') ||
                                  step.metadata?.baseInstructions?.includes('respond with VALID JSON ONLY') ||
                                  step.prompt?.includes('respond with ONLY valid JSON');
      
      if (expectsJsonResponse) {
        // For JSON steps, simulate streaming with progress indicators
        
        // Yield initial processing message
        if (step.name === "Asset Review") {
          yield {
            type: 'content',
            data: {
              content: userInput.toLowerCase().includes('shorter') || userInput.toLowerCase().includes('longer') || userInput.toLowerCase().includes('change') ? 
                'Revising your asset...' : 
                'Processing your feedback...',
              fullResponse: ''
            }
          };
        }
        
        // Get the complete response (non-streaming for JSON parsing)
        const aiResult = await this.openAIService.generateStepResponse(step, enhancedPrompt, []);
        accumulatedResponse = aiResult.responseText;
        
        // Debug: Log the complete AI response for JSON steps
        logger.info('🔍 DEBUG: Complete AI response for JSON step', {
          stepName: step.name,
          responseLength: accumulatedResponse.length,
          responsePreview: accumulatedResponse.substring(0, 300) + '...',
          responseEnd: '...' + accumulatedResponse.substring(Math.max(0, accumulatedResponse.length - 100))
        });
        
        // Process and extract conversational text
        const processedResult = await this.processAIResponse(step, workflow, accumulatedResponse, userInput);
        
        // Debug: Log the processed result to see what we're getting
        logger.info('🔍 DEBUG: Processed result from JSON step', {
          stepName: step.name,
          responseType: typeof processedResult.response,
          responseValue: JSON.stringify(processedResult.response),
          fullResult: JSON.stringify(processedResult)
        });
        
        // Ensure response is a string
        const responseText = typeof processedResult.response === 'string' 
          ? processedResult.response 
          : JSON.stringify(processedResult.response);
        
        // Yield the final conversational text
        yield {
          type: 'content',
          data: {
            content: responseText,
            fullResponse: responseText
          }
        };
        
        yield {
          type: 'done',
          data: {
            finalResponse: responseText,
            workflowTransition: processedResult.workflowTransition,
            ...(processedResult.isComplete && { isComplete: processedResult.isComplete }),
            ...(processedResult.nextStep && { nextStep: processedResult.nextStep })
          } as any
        };
        return;
      }
      
      // For non-JSON steps, use normal streaming
      for await (const chunk of this.openAIService.generateStepResponseStream(
        step,
        enhancedPrompt,
        []
      )) {
        if (chunk.type === 'content') {
          accumulatedResponse += chunk.data.content || '';
          
          // Yield the chunk for streaming display
          yield {
            type: 'content',
            data: {
              content: chunk.data.content,
              fullResponse: accumulatedResponse
            }
          };
        }
      }

      // Process the complete AI response
      const processedResult = await this.processAIResponse(step, workflow, accumulatedResponse, userInput);
      
      // Yield final result with any workflow transitions
      yield {
        type: 'done',
        data: {
          finalResponse: processedResult.response,
          fullResponse: processedResult.response,
          workflowTransition: processedResult.workflowTransition
        }
      };

    } catch (error) {
      logger.error('❌ Enhanced JSON Dialog Step Failed (STREAMING)', {
        stepId: step.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      yield {
        type: 'done',
        data: {
          finalResponse: 'I apologize, but I encountered an error processing your request. Please try again.',
          fullResponse: 'I apologize, but I encountered an error processing your request. Please try again.'
        }
      };
    }
  }

  /**
   * Enhanced JSON Dialog Step Handler (SYNCHRONOUS VERSION)
   * 
   * Processes JSON dialog steps with RAG context, security filtering,
   * and workflow transition logic.
   */
  async handleEnhancedJsonDialogStep(
    step: WorkflowStep,
    workflow: Workflow,
    userInput: string,
    ragContext: any,
    userId: string,
    orgId: string
  ): Promise<{
    response: string;
    nextStep?: any;
    isComplete: boolean;
    workflowTransition?: {
      newWorkflowId: string;
      workflowName: string;
    };
  }> {
    try {
      logger.info('🎯 Enhanced JSON Dialog Step Processing', {
        stepId: step.id.substring(0, 8),
        stepName: step.name,
        workflowId: workflow.id.substring(0, 8),
        hasRagContext: !!ragContext?.userDefaults,
        userInput: userInput.substring(0, 50)
      });

      // Check if this is a workflow selection step
      if (step.name === "Workflow Selection") {
        return await this.handleWorkflowSelection(step, workflow, userInput, ragContext);
      }

      // Handle auto-execution for steps like "Auto Generate Thread Title"
      if (step.metadata?.autoExecute && userInput === "auto-execute") {
        return await this.handleAutoExecuteStep(step, workflow, ragContext);
      }

      // For regular JSON dialog steps, enhance with RAG context
      // Get previous step responses for context
      const previousResponses = await WorkflowUtilities.gatherPreviousStepsContext(workflow);
      const enhancedPrompt = this.buildEnhancedPrompt(step, userInput, ragContext, previousResponses ? [previousResponses] : []);
      
      // Use the enhanced OpenAI service for context-aware responses
      const aiResult = await this.openAIService.generateStepResponse(
        step,
        enhancedPrompt,
        []
      );

      // Process the AI response and determine next steps
      return await this.processAIResponse(step, workflow, aiResult.responseText, userInput);

    } catch (error) {
      logger.error('❌ Enhanced JSON Dialog Step Failed', {
        stepId: step.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        response: "I encountered an error processing your request. Please try again.",
        isComplete: false
      };
    }
  }

  /**
   * Handle workflow selection specifically (STREAMING VERSION)
   */
  private async* handleWorkflowSelectionStream(
    step: WorkflowStep,
    workflow: Workflow,
    userInput: string,
    ragContext: any
  ): AsyncGenerator<{
    type: 'content' | 'done';
    data: {
      content?: string;
      fullResponse?: string;
      finalResponse?: string;
      workflowTransition?: {
        newWorkflowId: string;
        workflowName: string;
      };
    };
  }, void, unknown> {
    // Intent classification is already done in ChatService - use the intent from ragContext if available
    const intent = ragContext?.intent;
    
    logger.info('🎯 Workflow Selection Stream Handler', {
      stepName: step.name,
      userInput: userInput.substring(0, 50),
      hasIntent: !!intent,
      intentCategory: intent?.category,
      intentAction: intent?.action,
      intentWorkflow: intent?.workflowName,
      ragContextKeys: Object.keys(ragContext || {})
    });
    
    // Handle workflow action intents (start new workflow) OR continue_workflow in workflow selection
    if (intent && intent.workflowName && 
        ((intent.category === 'workflow_action' && intent.action === 'start_workflow') ||
         (intent.category === 'workflow_management' && intent.action === 'continue_workflow'))) {
      
      let targetWorkflow = intent.workflowName;
      
      // SPECIAL CASE: If Base Workflow + continue_workflow, look for specific workflow in conversation history
      if (intent.workflowName === 'Base Workflow' && intent.action === 'continue_workflow') {
        const conversationHistory = ragContext?.relatedConversations || [];
        const recentMessages = conversationHistory.slice(-5); // Check last 5 messages
        
        // Look for specific workflow mentions in recent conversation
        for (const message of recentMessages) {
          if (typeof message === 'string') {
            if (message.includes('Press Release')) {
              targetWorkflow = 'Press Release';
              break;
            } else if (message.includes('Blog Article')) {
              targetWorkflow = 'Blog Article';
              break;
            } else if (message.includes('Social Post')) {
              targetWorkflow = 'Social Post';
              break;
            } else if (message.includes('Media Pitch')) {
              targetWorkflow = 'Media Pitch';
              break;
            } else if (message.includes('Media Matching')) {
              targetWorkflow = 'Media Matching';
              break;
            } else if (message.includes('FAQ')) {
              targetWorkflow = 'FAQ';
              break;
            }
          }
        }
        
        logger.info('🔍 Base Workflow context analysis', {
          originalWorkflow: intent.workflowName,
          detectedWorkflow: targetWorkflow,
          conversationHints: recentMessages.slice(0, 3)
        });
      }
      
      logger.info('🎯 Workflow creation intent detected (STREAMING)', {
        selectedWorkflow: targetWorkflow,
        originalIntent: intent.workflowName,
        userInput,
        confidence: intent.confidence,
        stepName: step.name
      });

      // Get template ID for the target workflow
      const templateId = WorkflowUtilities.getTemplateIdForWorkflow(targetWorkflow);
      
      if (templateId) {
        // ALWAYS create workflow when workflow_action intent is detected
        logger.info('🚀 Creating new workflow from intent', {
          workflowName: targetWorkflow,
          templateId,
          userInput: userInput.substring(0, 50)
        });
        
        // Create workflow immediately for all workflow_action intents
        // NOTE: No finalResponse needed - the workflow creation process will send the appropriate first step message
        yield {
          type: 'done',
          data: {
            workflowTransition: {
              newWorkflowId: templateId,
              workflowName: targetWorkflow
            }
          }
        };
        return;
      }
    }

    // Handle conversational intents (questions, help, etc.)
    if (intent.category === 'conversational') {
      logger.info('💬 Conversational intent detected - using workflow-aware AI streaming', {
        action: intent.action,
        confidence: intent.confidence,
        hasCompletedWorkflows: true // We know they just completed a workflow
      });
      
      // Enhance RAG context with workflow completion information
      ragContext.workflowCompletion = {
        lastWorkflowType: workflow.templateId,
        completedSuccessfully: true,
        suggestNextSteps: true
      };
      
      // Fall through to enhanced AI streaming with workflow completion context
    }

    // Handle workflow management intents (continue, next steps, etc.)
    if (intent.category === 'workflow_management') {
      logger.info('🔄 Workflow management intent detected - using completion-aware streaming', {
        action: intent.action,
        workflowName: intent.workflowName,
        justCompletedWorkflow: true
      });
      
      // Add context about just completing a workflow
      ragContext.workflowCompletion = {
        lastWorkflowType: workflow.templateId,
        completedSuccessfully: true,
        userAskingForNextSteps: true,
        intent: intent.action
      };
      
      if (intent.shouldExit) {
        logger.info('🚪 Workflow exit requested', {
          action: intent.action,
          newWorkflow: intent.workflowName
        });
        // TODO: Implement workflow cancellation and potential new workflow start
      }
      
      // Fall through to AI streaming with rich completion context
    }

    // For all other cases, use AI streaming to process the request with intent context
    logger.info('⚠️ No intent match - falling back to AI streaming', {
      intentCategory: intent?.category,
      intentAction: intent?.action,
      intentWorkflow: intent?.workflowName,
      userInput: userInput.substring(0, 50),
      explanation: 'Intent did not match any workflow creation conditions'
    });
    
    const enhancedPrompt = this.buildWorkflowSelectionPrompt(userInput, ragContext);
    
    // Create a temporary step for workflow selection
    const tempStep = { ...step, prompt: enhancedPrompt };
    
    let accumulatedResponse = '';
    
    // Use streaming OpenAI service for real-time responses
    for await (const chunk of this.openAIService.generateStepResponseStream(
      tempStep,
      userInput,
      []
    )) {
      if (chunk.type === 'content') {
        accumulatedResponse += chunk.data.content || '';
        
        // Yield the chunk for streaming display
        yield {
          type: 'content',
          data: {
            content: chunk.data.content,
            fullResponse: accumulatedResponse
          }
        };
      }
    }

    // Try to extract workflow selection from complete AI response
    const aiSelection = WorkflowUtilities.extractWorkflowSelection(accumulatedResponse);
    
    if (aiSelection.workflowSelected) {
      const templateId = WorkflowUtilities.getTemplateIdForWorkflow(aiSelection.workflowSelected);
      
      if (templateId) {
        yield {
          type: 'done',
          data: {
            finalResponse: `Great choice! Let's proceed with ${aiSelection.workflowSelected}.`,
            workflowTransition: {
              newWorkflowId: templateId,
              workflowName: aiSelection.workflowSelected
            }
          }
        };
        return;
      }
    }

    // If no workflow selected but we have a conversational response, use that
    if (aiSelection.isConversational && aiSelection.conversationalResponse) {
      yield {
        type: 'done',
        data: {
          finalResponse: aiSelection.conversationalResponse
        }
      };
      return;
    }

    // Fall back to raw response
    yield {
      type: 'done',
      data: {
        finalResponse: accumulatedResponse
      }
    };
  }

  /**
   * Handle workflow selection specifically (SYNCHRONOUS VERSION)
   */
  private async handleWorkflowSelection(
    step: WorkflowStep,
    workflow: Workflow,
    userInput: string,
    ragContext: any
  ): Promise<any> {
    // Check if user input directly indicates a workflow selection
    const directSelection = WorkflowUtilities.isWorkflowSelection(userInput);
    
    if (directSelection.isSelection && directSelection.workflowName) {
      logger.info('🎯 Direct workflow selection detected', {
        selectedWorkflow: directSelection.workflowName,
        userInput
      });

      // Get template ID for the selected workflow
      const templateId = WorkflowUtilities.getTemplateIdForWorkflow(directSelection.workflowName);
      
      if (templateId) {
        return {
          response: `Perfect! Let's start your ${directSelection.workflowName}. I'll begin gathering the information we need.`,
          isComplete: true,
          workflowTransition: {
            newWorkflowId: templateId,
            workflowName: directSelection.workflowName
          }
        };
      }
    }

    // If not a direct selection, use AI to process the request
    const enhancedPrompt = this.buildWorkflowSelectionPrompt(userInput, ragContext);
    
    // Create a temporary step for workflow selection
    const tempStep = { ...step, prompt: enhancedPrompt };
    const aiResult = await this.openAIService.generateStepResponse(
      tempStep,
      userInput,
      []
    );
    const aiResponse = aiResult.responseText;

    // Try to extract workflow selection from AI response
    const aiSelection = WorkflowUtilities.extractWorkflowSelection(aiResponse);
    
    if (aiSelection.workflowSelected) {
      const templateId = WorkflowUtilities.getTemplateIdForWorkflow(aiSelection.workflowSelected);
      
      if (templateId) {
        return {
          response: `Great choice! Let's proceed with ${aiSelection.workflowSelected}.`,
          isComplete: true,
          workflowTransition: {
            newWorkflowId: templateId,
            workflowName: aiSelection.workflowSelected
          }
        };
      }
    }

    // If no workflow selected but we have a conversational response, use that
    if (aiSelection.isConversational && aiSelection.conversationalResponse) {
      return {
        response: aiSelection.conversationalResponse,
        isComplete: true
      };
    }

    // Fall back to raw response
    return {
      response: aiResponse,
      isComplete: false
    };
  }

  /**
   * Handle auto-execute steps like thread title generation
   */
  private async handleAutoExecuteStep(
    step: WorkflowStep,
    workflow: Workflow,
    ragContext: any
  ): Promise<any> {
    logger.info('🚀 Auto-executing step', {
      stepName: step.name,
      stepType: step.stepType
    });

    if (step.name === "Auto Generate Thread Title") {
      // Check if we're in conversational mode (no specific workflow selected)
      const previousStepsContext = await WorkflowUtilities.gatherPreviousStepsContext(workflow);
      
      if (previousStepsContext.selectedWorkflow || previousStepsContext.workflowselectionInput) {
        // We have a workflow selection, proceed with title generation
        const title = await this.generateThreadTitle(workflow, ragContext);
        
        return {
          response: `Thread title: "${title}"`,
          isComplete: true
        };
      } else {
        // We're in conversational mode, skip title generation
        logger.info('🔄 Skipping auto thread title generation - conversational mode detected');
        
        return {
          response: "", // Silent completion
          isComplete: true
        };
      }
    }

    if (step.name === "AI Author Generation") {
      // Handle Media Matching AI Author Generation auto-execution
      logger.info('🎯 Auto-executing AI Author Generation step');
      
      // Get the topic from previous step context
      const previousStepsContext = await WorkflowUtilities.gatherPreviousStepsContext(workflow);
      const topic = previousStepsContext.collectedInformation?.topic || ragContext?.topic || "robotics delivery companies";
      
      // Build enhanced prompt for AI author generation
      const enhancedPrompt = step.metadata?.baseInstructions || step.prompt || "";
      const finalPrompt = enhancedPrompt.replace(/\{topic\}/g, topic);
      
      // Generate AI response for author suggestions
      try {
        const aiResult = await this.openAIService.generateStepResponse(
          step,
          finalPrompt + `\n\nTopic: ${topic}`,
          []
        );

        // Process the AI response
        return await this.processAIResponse(step, workflow, aiResult.responseText, "auto-execute");
      } catch (error) {
        logger.error('❌ Failed to auto-execute AI Author Generation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stepId: step.id.substring(0, 8)
        });
        
        return {
          response: "I encountered an issue generating author suggestions. Let me continue with the media matching process.",
          isComplete: true
        };
      }
    }

    // DISABLED: Old simulated Metabase handler - now using real implementation in media-matching-handlers.ts
    if (false && step.name === "Metabase Article Search") {
      // Handle Metabase Article Search auto-execution with security
      logger.info('🔒 Auto-executing Metabase Article Search step (SECURED)', {
        stepId: step.id.substring(0, 8),
        securityLevel: step.metadata?.securityLevel,
        excludeFromHistory: step.metadata?.excludeFromHistory
      });
      
      // Get the authors from previous step context
      const previousStepsContext = await WorkflowUtilities.gatherPreviousStepsContext(workflow);
      const authors = previousStepsContext.collectedInformation?.suggestedAuthors || [];
      
      // Simulate database search (in real implementation, this would call the actual Metabase API)
      try {
        // This is where the actual Metabase API call would happen
        // For now, simulate a successful search result
        const searchResults = {
          searchCompleted: true,
          authorsSearched: authors.length,
          articlesFound: Math.floor(Math.random() * 50) + 20, // Simulate 20-70 articles found
          timespan: "past 6 months",
          database: "metabase_articles"
        };

        const responseMessage = `🔍 Database search completed. Found ${searchResults.articlesFound} recent articles from ${searchResults.authorsSearched} authors. Moving to analysis phase...`;

        // Use the enhanced workflow service to save with security metadata
        const enhancedService = new EnhancedWorkflowService();
        await enhancedService.addSecureStepMessage(workflow.threadId, responseMessage, step);

        return {
          response: responseMessage,
          isComplete: true,
          collectedInformation: {
            searchResults: searchResults,
            authors: authors,
            securityLevel: "confidential" // Mark results as confidential
          }
        };
      } catch (error: any) {
        logger.error('❌ Failed to auto-execute Metabase Article Search', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stepId: step.id.substring(0, 8)
        });
        
        return {
          response: "Database search encountered an issue. Continuing with analysis using available data.",
          isComplete: true
        };
      }
    }

    // Default auto-execute behavior
    return {
      response: "Step completed automatically.",
      isComplete: true
    };
  }

  /**
   * Build enhanced prompt with RAG context
   */
  public buildEnhancedPrompt(step: WorkflowStep, userInput: string, ragContext: any, previousResponses?: any[]): string {
    // Start with base instructions which contain the critical JSON format requirements
    let prompt = step.metadata?.baseInstructions || step.prompt || "";
    
    // If we have both baseInstructions and prompt, combine them properly
    if (step.metadata?.baseInstructions && step.prompt && step.metadata.baseInstructions !== step.prompt) {
      prompt = step.metadata.baseInstructions + `\n\nADDITIONAL CONTEXT:\n${step.prompt}`;
    }
    
    // Inject user context
    if (ragContext?.userDefaults?.companyName) {
      prompt += `\n\nUSER CONTEXT: User works at ${ragContext.userDefaults.companyName}`;
      
      if (ragContext.userDefaults.industry) {
        prompt += ` in the ${ragContext.userDefaults.industry} industry`;
      }
    }
    
    // Add previous step context for Media Matching workflows
    if (step.name === "AI Author Generation" && previousResponses) {
      const topicInfo = previousResponses.find(r => r.collectedInformation?.topic);
      if (topicInfo?.collectedInformation?.topic) {
        prompt += `\n\nTOPIC FROM PREVIOUS STEP: ${topicInfo.collectedInformation.topic}`;
        if (topicInfo.collectedInformation.topicKeywords) {
          prompt += `\nKEYWORDS: ${topicInfo.collectedInformation.topicKeywords.join(', ')}`;
        }
      }
    }
    
    // Add the user input
    prompt += `\n\nUser Input: ${userInput}`;
    
    return prompt;
  }

  /**
   * Build system message with RAG context
   */
  private buildSystemMessage(step: WorkflowStep, ragContext: any): string {
    let systemMessage = `You are an expert PR and communications assistant helping with a ${step.name} step.`;
    
    if (ragContext?.userDefaults) {
      systemMessage += ` The user's context: ${JSON.stringify(ragContext.userDefaults, null, 2)}`;
    }
    
    systemMessage += ` Provide helpful, context-aware responses.`;
    
    return systemMessage;
  }

  /**
   * Build specific prompt for workflow selection
   */
  private buildWorkflowSelectionPrompt(userInput: string, ragContext: any): string {
    let prompt = `Based on the user's request, determine if they want to select a specific workflow or if they're asking a general question.

Available workflows:
- Press Release: For creating press releases and announcements
- Blog Article: For writing blog posts and articles  
- Social Post: For social media content
- Media Pitch: For media outreach
- Media List Generator: For building media contact lists
- Launch Announcement: For product/service launches
- FAQ: For creating FAQ documents

User Request: ${userInput}`;

    if (ragContext?.userDefaults?.companyName) {
      prompt += `\n\nUser Context: ${ragContext.userDefaults.companyName}`;
      if (ragContext.userDefaults.industry) {
        prompt += ` (${ragContext.userDefaults.industry})`;
      }
    }

    prompt += `\n\nIf they're selecting a workflow, respond with JSON: {"selectedWorkflow": "Workflow Name"}
If they're asking a general question, respond with JSON: {"conversationalResponse": "Your helpful response listing available options"}`;

    return prompt;
  }

  /**
   * Build system message for workflow selection
   */
  private buildWorkflowSelectionSystemMessage(ragContext: any): string {
    return `You are a PR workflow assistant. Help users either select appropriate workflows or answer general questions about available options. Always respond in the specified JSON format.`;
  }

  /**
   * Get asset type from workflow template based on template ID
   */
  private getAssetTypeFromWorkflow(workflow: Workflow): string | null {
    const templateMappings: Record<string, string> = {
      '00000000-0000-0000-0000-000000000008': 'press_release',
      '00000000-0000-0000-0000-000000000009': 'media_pitch', 
      '00000000-0000-0000-0000-000000000010': 'social_post',
      '00000000-0000-0000-0000-000000000011': 'blog_article',
      '00000000-0000-0000-0000-000000000012': 'faq_document'
    };
    
    return templateMappings[workflow.templateId] || null;
  }

  /**
   * Process AI response and determine next steps
   */
  private async processAIResponse(
    step: WorkflowStep,
    workflow: Workflow,
    aiResponse: string,
    userInput: string
  ): Promise<any> {
    // Clean markdown code blocks from AI response (like the original service does)
    let cleanedResponse = aiResponse.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to parse as JSON for structured responses
    try {
      const parsed = JSON.parse(cleanedResponse);
      
      // Handle Workflow Selection step responses
      if (step.name === "Workflow Selection") {
        // Check for conversational response (like "what can i do?")
        if (parsed.collectedInformation?.conversationalResponse) {
          return {
            response: parsed.collectedInformation.conversationalResponse,
            isComplete: true
          };
        }
        
        // Check for workflow selection
        if (parsed.collectedInformation?.selectedWorkflow) {
          const templateId = WorkflowUtilities.getTemplateIdForWorkflow(parsed.collectedInformation.selectedWorkflow);
          if (templateId) {
            return {
              response: `Perfect! Let's start your ${parsed.collectedInformation.selectedWorkflow}. I'll begin gathering the information we need.`,
              isComplete: true,
              workflowTransition: {
                newWorkflowId: templateId,
                workflowName: parsed.collectedInformation.selectedWorkflow
              }
            };
          }
        }
      }
      
      // 📝 Handle Asset Review step responses
      if (step.name === "Asset Review" && parsed.collectedInformation) {
        const reviewDecision = parsed.collectedInformation.reviewDecision;
        
        // Handle revisions with revised asset content
        if (reviewDecision === "revision_generated" && parsed.collectedInformation.revisedAsset) {
          const assetType = this.getAssetTypeFromWorkflow(workflow) || 'press_release';
          logger.info('📝 STREAMING: Asset Review revision detected', {
            stepId: step.id.substring(0, 8),
            hasRevisedAsset: !!parsed.collectedInformation.revisedAsset,
            assetType: assetType,
            userInput: userInput.substring(0, 50)
          });
          
          try {
            // Use the enhanced workflow service to save asset messages
            const enhancedService = new EnhancedWorkflowService();
            
            // Save the revised asset message
            await enhancedService.addAssetMessage(
              workflow.threadId,
              parsed.collectedInformation.revisedAsset,
              assetType,
              step.id,
              step.name,
              true // isRevision = true
            );
            
            logger.info('✅ STREAMING: Asset Review revision saved successfully', {
              stepId: step.id.substring(0, 8),
              contentLength: parsed.collectedInformation.revisedAsset.length,
              assetType: assetType
            });
          } catch (error) {
            logger.error('❌ STREAMING: Failed to save Asset Review revision', {
              stepId: step.id.substring(0, 8),
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          
          return {
            response: parsed.nextQuestion || "Here's your updated asset. Please review and let me know if you need further modifications or if you're satisfied.",
            isComplete: false,
            nextStep: parsed.nextStep
          };
        }
        
        // Handle approval
        if (reviewDecision === "approved") {
          try {
            // Import database service to complete workflow
                      const dbService = new WorkflowDBService();
            
            // Mark step as complete
            await dbService.updateStep(step.id, {
              status: 'complete' as any
            });
            
            // Complete the workflow
            await dbService.updateWorkflowStatus(workflow.id, 'completed' as any);
            await dbService.updateWorkflowCurrentStep(workflow.id, null);
            
            logger.info('✅ STREAMING: Asset Review workflow completed', {
              stepId: step.id.substring(0, 8),
              workflowId: workflow.id.substring(0, 8)
            });
            
            // Let conversation continue naturally without auto-creating Base Workflow
            // Users can explicitly request workflows when needed
            logger.info('✅ STREAMING: Workflow completed, ready for natural conversation', {
              completedWorkflowId: workflow.id.substring(0, 8),
              threadId: workflow.threadId.substring(0, 8),
              approach: 'conversational_mode'
            });
          } catch (error) {
            logger.error('❌ STREAMING: Failed to complete workflow', {
              stepId: step.id.substring(0, 8),
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          
          return {
            response: "Asset approved! Your workflow is now complete.",
            isComplete: true,
            nextStep: null
          };
        }
        
        // Handle unclear requests
        if (reviewDecision === "unclear") {
          return {
            response: parsed.nextQuestion || "Would you like me to make changes to the asset, or are you satisfied with it as-is?",
            isComplete: false,
            nextStep: parsed.nextStep
          };
        }
      }
      
      // Handle Media Matching "Topic Input" step completion
      if (step.name === "Topic Input" && parsed.isComplete === true && parsed.collectedInformation?.topic) {
        logger.info('🎯 STREAMING: Topic Input completed, advancing to AI Author Generation', {
          stepId: step.id.substring(0, 8),
          topic: parsed.collectedInformation.topic,
          keywords: parsed.collectedInformation.topicKeywords?.length || 0
        });

        // Auto-advance to AI Author Generation step
        try {
          const dbService = new WorkflowDBService();
          
          // Mark current step as complete
          await dbService.updateStep(step.id, {
            status: 'complete' as any
          });

          // Find and activate the AI Author Generation step
          const nextStep = workflow.steps?.find(s => s.name === "AI Author Generation");
          if (nextStep) {
            await dbService.updateStep(nextStep.id, {
              status: 'in_progress' as any
            });
            await dbService.updateWorkflowCurrentStep(workflow.id, nextStep.id);

            logger.info('✅ STREAMING: Advanced to AI Author Generation step', {
              stepId: nextStep.id.substring(0, 8),
              fromStepId: step.id.substring(0, 8),
              autoExecute: nextStep.metadata?.autoExecute
            });

            // Auto-execute the AI Author Generation step
            if (nextStep.metadata?.autoExecute) {
              try {
                const enhancedService = new EnhancedWorkflowService();
                
                // Auto-execute the next step
                const autoExecResult = await enhancedService.checkAndHandleAutoExecution(
                  nextStep.id,
                  workflow.id,
                  workflow.threadId,
                  '', // userId
                  ''  // orgId
                );

                if (autoExecResult.autoExecuted) {
                  logger.info('✅ STREAMING: AI Author Generation auto-executed successfully', {
                    stepId: nextStep.id.substring(0, 8)
                  });
                } else {
                  logger.warn('⚠️ STREAMING: AI Author Generation auto-execution failed', {
                    stepId: nextStep.id.substring(0, 8)
                  });
                }
              } catch (autoExecError) {
                logger.error('❌ STREAMING: Failed to auto-execute AI Author Generation', {
                  error: autoExecError instanceof Error ? autoExecError.message : 'Unknown error',
                  stepId: nextStep.id.substring(0, 8)
                });
              }
            }
          }
        } catch (error) {
          logger.error('❌ STREAMING: Failed to advance to AI Author Generation', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stepId: step.id.substring(0, 8)
          });
        }

        return {
          response: parsed.nextQuestion || "Perfect! I've collected your topic. Now I'll use AI to identify relevant authors and search for their recent articles.",
          isComplete: true,
          nextStep: parsed.nextStep
        };
      }

      // Handle Metabase Article Search step completion (SECURED)
      if (step.name === "Metabase Article Search" && parsed.isComplete === true) {
        logger.info('🔒 STREAMING: Metabase Article Search completed (SECURED), advancing to Article Analysis', {
          stepId: step.id.substring(0, 8),
          searchResults: parsed.collectedInformation?.searchResults?.articlesFound || 'unknown',
          securityLevel: 'confidential'
        });

        // Auto-advance to Article Analysis & Ranking step
        try {
          const dbService = new WorkflowDBService();
          
          // Mark current step as complete
          await dbService.updateStep(step.id, {
            status: 'complete' as any
          });

          // Find and activate the Article Analysis & Ranking step
          const nextStep = workflow.steps?.find(s => s.name === "Article Analysis & Ranking");
          if (nextStep) {
            await dbService.updateStep(nextStep.id, {
              status: 'in_progress' as any
            });
            await dbService.updateWorkflowCurrentStep(workflow.id, nextStep.id);

            logger.info('✅ STREAMING: Advanced to Article Analysis & Ranking step', {
              stepId: nextStep.id.substring(0, 8),
              fromStepId: step.id.substring(0, 8)
            });
          }
        } catch (error) {
          logger.error('❌ STREAMING: Failed to advance to Article Analysis & Ranking', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stepId: step.id.substring(0, 8)
          });
        }

        return {
          response: parsed.response || "Database search completed. Proceeding to analyze and rank the articles for relevance.",
          isComplete: true,
          nextStep: parsed.nextStep
        };
      }

      // Handle AI Author Generation step completion  
      if (step.name === "AI Author Generation" && parsed.isComplete === true && parsed.collectedInformation?.suggestedAuthors) {
        logger.info('🎯 STREAMING: AI Author Generation completed, advancing to Database Search', {
          stepId: step.id.substring(0, 8),
          authorCount: parsed.collectedInformation.suggestedAuthors?.length || 0,
          keywords: parsed.collectedInformation.keywords?.length || 0
        });

        // Auto-advance to Database Search step
        try {
          const dbService = new WorkflowDBService();
          
          // Mark current step as complete and store the collected information
          await dbService.updateStep(step.id, {
            status: 'complete' as any,
            metadata: {
              ...step.metadata,
              collectedInformation: parsed.collectedInformation,
              completedAt: new Date().toISOString()
            }
          });

          // Find and activate the Database Search step
          const nextStep = workflow.steps?.find(s => s.name === "Database Search");
          if (nextStep) {
            await dbService.updateStep(nextStep.id, {
              status: 'in_progress' as any
            });
            await dbService.updateWorkflowCurrentStep(workflow.id, nextStep.id);

            logger.info('✅ STREAMING: Advanced to Database Search step', {
              stepId: nextStep.id.substring(0, 8),
              fromStepId: step.id.substring(0, 8)
            });
          }
        } catch (error) {
          logger.error('❌ STREAMING: Failed to advance to Database Search', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stepId: step.id.substring(0, 8)
          });
        }

        // Format the author list for display
        const authors = parsed.collectedInformation.suggestedAuthors || [];
        const authorListText = authors.length > 0 
          ? authors.map((author: any, index: number) => 
              `${index + 1}. **${author.name}** (${author.organization}) - Score: ${author.relevanceScore}/10`
            ).join('\n')
          : "No authors generated";

        const displayMessage = `Perfect! I've generated ${authors.length} potential journalists who write about this topic:

**Generated Authors:**
${authorListText}

Now I'll search for their recent articles.`;

        return {
          response: displayMessage,
          isComplete: true,
          nextStep: parsed.nextStep
        };
      }

      // Handle Information Collection step completion
      if (step.name === "Information Collection" && parsed.isComplete === true && parsed.suggestedNextStep === "Asset Generation") {
        logger.info('🎯 STREAMING: Information Collection completed, advancing to Asset Generation', {
          stepId: step.id.substring(0, 8),
          completionPercentage: parsed.completionPercentage,
          autofilledInfo: parsed.autofilledInformation?.length || 0
        });

        // Auto-advance to Asset Generation step
        try {
          const dbService = new WorkflowDBService();
          
          // Mark current step as complete
          await dbService.updateStep(step.id, {
            status: 'complete' as any
          });

          // Find and activate the Asset Generation step
          const nextStep = workflow.steps?.find(s => s.name === "Asset Generation");
          if (nextStep) {
            await dbService.updateStep(nextStep.id, {
              status: 'in_progress' as any
            });
            await dbService.updateWorkflowCurrentStep(workflow.id, nextStep.id);

            logger.info('✅ STREAMING: Advanced to Asset Generation step', {
              stepId: nextStep.id.substring(0, 8),
              fromStepId: step.id.substring(0, 8)
            });

            // Directly trigger asset generation execution using streaming
            try {
              const enhancedService = new EnhancedWorkflowService();
              
              // Use the streaming method which is public
              const assetGenerator = enhancedService.handleStepResponseStreamWithContext(
                nextStep.id,
                JSON.stringify(parsed.collectedInformation),
                'system',
                'default'
              );
              
              let assetResponse = '';
              for await (const chunk of assetGenerator) {
                if (chunk.type === 'content' && chunk.data?.content) {
                  assetResponse += chunk.data.content;
                }
              }
              
              const assetResult = { response: assetResponse };

              logger.info('✅ STREAMING: Asset generation completed automatically', {
                stepId: nextStep.id.substring(0, 8),
                assetGenerated: !!assetResult.response
              });

              // Return combined transition + asset generation response
              return {
                response: `Information collected successfully. Generating your asset now...\n\n${assetResult.response}`,
                isComplete: true,
                nextStep: {
                  id: nextStep.id,
                  name: nextStep.name,
                  autoExecuted: true
                }
              };

            } catch (assetError) {
              logger.error('❌ STREAMING: Asset generation failed during auto-execution', {
                error: assetError instanceof Error ? assetError.message : 'Unknown error',
                stepId: nextStep.id.substring(0, 8)
              });

              // Fallback to just the transition message
              return {
                response: "Information collected successfully. Generating your asset now...",
                isComplete: true,
                nextStep: {
                  id: nextStep.id,
                  name: nextStep.name,
                  autoExecute: true
                }
              };
            }
          }
        } catch (error) {
          logger.error('❌ STREAMING: Failed to auto-advance to Asset Generation', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stepId: step.id.substring(0, 8)
          });
        }
      }

      // Handle other JSON dialog responses
      if (parsed.isComplete !== undefined) {
        // Try different response fields in order of preference
        const conversationalText = 
          parsed.response || 
          parsed.conversationalResponse || 
          parsed.nextQuestion ||
          parsed.message ||
          aiResponse;

        return {
          response: conversationalText,
          isComplete: parsed.isComplete,
          nextStep: parsed.nextStep
        };
      }
    } catch (e) {
      // Not JSON, treat as regular response
    }

    // Default response processing
    return {
      response: aiResponse,
      isComplete: false
    };
  }

  /**
   * Generate thread title based on workflow context
   */
  private async generateThreadTitle(workflow: Workflow, ragContext: any): Promise<string> {
    const context = await WorkflowUtilities.gatherPreviousStepsContext(workflow);
    
    let prompt = "Generate a concise thread title based on this workflow context:\n\n";
    prompt += JSON.stringify(context, null, 2);
    
    if (ragContext?.userDefaults?.companyName) {
      prompt += `\n\nCompany: ${ragContext.userDefaults.companyName}`;
    }
    
    prompt += "\n\nProvide just the title, 3-8 words max.";
    
    // Create a temporary step for title generation
    const tempStep = { 
      id: 'temp-title', 
      name: 'Generate Title', 
      prompt, 
      stepType: StepType.JSON_DIALOG,
      workflowId: workflow.id,
      order: 0,
      status: StepStatus.IN_PROGRESS
    } as WorkflowStep;
    
    const titleResult = await this.openAIService.generateStepResponse(
      tempStep,
      'Generate title',
      []
    );
    const title = titleResult.responseText;
    
    return title.trim().replace(/"/g, '');
  }
} 