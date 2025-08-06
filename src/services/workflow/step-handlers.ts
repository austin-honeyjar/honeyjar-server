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
      const enhancedPrompt = this.buildEnhancedPrompt(step, userInput, ragContext);
      
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
    
    // Handle workflow action intents (start new workflow)
    if (intent.category === 'workflow_action' && intent.action === 'start_workflow' && intent.workflowName) {
      logger.info('🎯 Workflow creation intent detected (STREAMING)', {
        selectedWorkflow: intent.workflowName,
        userInput,
        confidence: intent.confidence
      });

      // Get template ID for the selected workflow
      const templateId = WorkflowUtilities.getTemplateIdForWorkflow(intent.workflowName);
      
      if (templateId) {
        const response = `Perfect! Let's start your ${intent.workflowName}. I'll begin gathering the information we need.`;
        
        yield {
          type: 'content',
          data: {
            content: response,
            fullResponse: response,
            finalResponse: response
          }
        };
        
        yield {
          type: 'done',
          data: {
            finalResponse: response,
            workflowTransition: {
              newWorkflowId: templateId,
              workflowName: intent.workflowName
            }
          }
        };
        return;
      }
    }

    // Handle conversational intents (questions, help, etc.)
    if (intent.category === 'conversational') {
      logger.info('💬 Conversational intent detected - using regular AI streaming', {
        action: intent.action,
        confidence: intent.confidence
      });
      // Fall through to regular AI streaming with enhanced context awareness
    }

    // Handle workflow management intents (cancel, switch, etc.)
    if (intent.category === 'workflow_management') {
      if (intent.shouldExit) {
        logger.info('🚪 Workflow exit requested', {
          action: intent.action,
          newWorkflow: intent.workflowName
        });
        
        // TODO: Implement workflow cancellation and potential new workflow start
        // For now, fall through to AI streaming which can handle this contextually
      }
    }

    // For all other cases, use AI streaming to process the request with intent context
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
    let prompt = step.prompt || "";
    
    // Inject user context
    if (ragContext?.userDefaults?.companyName) {
      prompt += `\n\nCONTEXT: User works at ${ragContext.userDefaults.companyName}`;
      
      if (ragContext.userDefaults.industry) {
        prompt += ` in the ${ragContext.userDefaults.industry} industry`;
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
          logger.info('📝 STREAMING: Asset Review revision detected', {
            stepId: step.id.substring(0, 8),
            hasRevisedAsset: !!parsed.collectedInformation.revisedAsset,
            assetType: step.metadata?.assetType || 'press_release',
            userInput: userInput.substring(0, 50)
          });
          
          try {
            // Use the enhanced workflow service to save asset messages
            const enhancedService = new EnhancedWorkflowService();
            
            // Save the revised asset message
            await enhancedService.addAssetMessage(
              workflow.threadId,
              parsed.collectedInformation.revisedAsset,
              step.metadata?.assetType || 'press_release',
              step.id,
              step.name,
              true // isRevision = true
            );
            
            logger.info('✅ STREAMING: Asset Review revision saved successfully', {
              stepId: step.id.substring(0, 8),
              contentLength: parsed.collectedInformation.revisedAsset.length,
              assetType: step.metadata?.assetType || 'press_release'
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
            
            // Create new Base Workflow for continued conversation
            try {
                      // Use the enhanced workflow service to create Base Workflow
        const enhancedService = new EnhancedWorkflowService();
              
              await enhancedService.createWorkflow(workflow.threadId, '00000000-0000-0000-0000-000000000000', false);
              
              logger.info('✅ STREAMING: Auto-created new Base Workflow for continued conversation', {
                completedWorkflowId: workflow.id.substring(0, 8),
                threadId: workflow.threadId.substring(0, 8)
              });
            } catch (autoCreateError) {
              logger.error('❌ STREAMING: Failed to auto-create Base Workflow after completion', {
                error: autoCreateError instanceof Error ? autoCreateError.message : 'Unknown error',
                completedWorkflowId: workflow.id.substring(0, 8)
              });
              // Don't fail the approval if auto-creation fails
            }
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