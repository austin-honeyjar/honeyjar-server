import { WorkflowStep, StepStatus, StepType } from '../types/workflow';
import { OpenAIService } from './openai.service';
import logger from '../utils/logger';
import { MessageContentHelper, StructuredMessageContent } from '../types/chat-message';

/**
 * Simple service for handling JSON Dialog step types
 */
export class JsonDialogService {
  private openAIService: OpenAIService;

  constructor() {
    this.openAIService = new OpenAIService();
  }

  /**
   * Process a user message for a JSON Dialog step
   */
  async processMessage(
    step: WorkflowStep, 
    userInput: string,
    conversationHistory: string[] = [],
    threadId?: string
  ): Promise<{
    isStepComplete: boolean;
    isComplete?: boolean;
    nextQuestion?: string;
    collectedInformation: Record<string, any>;
    suggestedNextStep?: string;
    apiResponse: string;
    readyToGenerate?: boolean;
    mode?: string;
  }> {
    try {
      logger.info('Processing JSON dialog message', {
        stepId: step.id,
        stepName: step.name,
        historyLength: conversationHistory.length,
        userInputLength: userInput.length,
        threadId: threadId || 'not provided'
      });

      // If threadId is not provided, try to get it from the workflow
      let actualThreadId = threadId;
      if (!actualThreadId) {
        try {
          // Import dependencies without causing circular imports
          const { db } = await import('../db');
          const { workflows } = await import('../db/schema');
          const { eq } = await import('drizzle-orm');
          
          const workflow = await db.query.workflows.findFirst({
            where: eq(workflows.id, step.workflowId)
          });
          
          if (workflow) {
            actualThreadId = workflow.threadId;
            logger.info('Retrieved threadId from workflow', {
              workflowId: step.workflowId,
              threadId: actualThreadId
            });
          } else {
            logger.error('Could not find workflow to get threadId', {
              workflowId: step.workflowId
            });
          }
        } catch (error) {
          logger.error('Error retrieving workflow for threadId', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Special handling for the "Generate an Asset" step - send a "generating" message
      if ((step.name === "Generate an Asset" || step.name === "Asset Generation") && !userInput.includes("INTERNAL_SYSTEM_PROMPT")) {
        // Set userInput to include a system flag to avoid infinite recursion
        const systemPrompt = `${userInput}\n\nINTERNAL_SYSTEM_PROMPT: This is the final user input for generating the press release.`;
        
        // Import dependencies without causing circular imports
        const { db } = await import('../db');
        const { chatMessages } = await import('../db/schema');
        
        if (actualThreadId) {
          try {
            // Insert a "generating" message before starting the process
            await db.insert(chatMessages)
              .values({
                threadId: actualThreadId, // Use the actual thread ID
                content: "Generating your PR asset now. This may take a moment...",
                role: "assistant",
                userId: "system"
              });
              
            logger.info('Added generating message to chat', { threadId: actualThreadId });
          } catch (error) {
            logger.error('Error adding generating message to chat', {
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Continue even if the message couldn't be added
          }
        } else {
          logger.warn('Could not add generating message - no threadId available');
        }
        
        // Use the modified prompt
        userInput = systemPrompt;
      }

      // Check if this might be an initial step entry
      const isInitialEntry = !step.metadata?.processedFirstMessage && 
                           (!userInput || userInput.trim() === '');
      
      // Get the step's goal and any previously collected information
      const goal = step.metadata?.goal || `Determine if user has selected a workflow type`;
      const collectedInfo = step.metadata?.collectedInformation || {};
      
      // For initial entry with empty user input, return basic info without calling OpenAI
      if (isInitialEntry) {
        logger.info('Initial entry to step detected, returning basic info', {
          stepName: step.name
        });
        
        // Mark that we've processed the first message
        await this.updateStepMetadata(step.id, {
          ...step.metadata,
          processedFirstMessage: true
        });
        
        return {
          isStepComplete: false,
          nextQuestion: step.prompt || 'Please provide the requested information.',
          collectedInformation: collectedInfo,
          apiResponse: '',
          readyToGenerate: false
        };
      }
      
      // Get required fields for this step type (if defined)
      const requiredFields = this.getRequiredFieldsForStep(step);
      
      // Create a system prompt with conversation history
      const systemPrompt = this.createSystemPrompt(
        step, 
        goal, 
        collectedInfo, 
        conversationHistory, 
        userInput, 
        requiredFields
      );

      // Create a custom step with the system prompt
      const customStep = {
        ...step,
        metadata: {
          ...step.metadata,
          openai_instructions: systemPrompt
        }
      };

      // Call OpenAI to process the user input
      const openAIResult = await this.openAIService.generateStepResponse(
        customStep,
        userInput,
        []
      );

      // Parse the JSON response
      let responseData;
      try {
        // Clean the response text to remove markdown code blocks if present
        let cleanedResponseText = openAIResult.responseText.trim();
        
        // Remove markdown code blocks (```json ... ``` or ``` ... ```)
        if (cleanedResponseText.startsWith('```json')) {
          cleanedResponseText = cleanedResponseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedResponseText.startsWith('```')) {
          cleanedResponseText = cleanedResponseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        // Also handle cases where there might be backticks without the full markdown syntax
        if (cleanedResponseText.startsWith('`') && cleanedResponseText.endsWith('`')) {
          cleanedResponseText = cleanedResponseText.slice(1, -1);
        }
        
        logger.debug('Attempting to parse cleaned JSON response', {
          originalLength: openAIResult.responseText.length,
          cleanedLength: cleanedResponseText.length,
          wasMarkdown: cleanedResponseText !== openAIResult.responseText,
          cleanedPreview: cleanedResponseText.substring(0, 100) + '...'
        });
        
        responseData = JSON.parse(cleanedResponseText);
        
        // Handle different field naming conventions
        // Check for isComplete or isStepComplete
        if (typeof responseData.isComplete === 'boolean' && responseData.isStepComplete === undefined) {
          responseData.isStepComplete = responseData.isComplete;
        } else if (typeof responseData.isStepComplete === 'boolean' && responseData.isComplete === undefined) {
          responseData.isComplete = responseData.isStepComplete;
        } else if (responseData.isComplete === undefined && responseData.isStepComplete === undefined) {
          // No completion status at all
          throw new Error('Missing isComplete or isStepComplete boolean field in response');
        }

        // Handle extractedInformation vs collectedInformation
        if (responseData.extractedInformation && !responseData.collectedInformation) {
          // Convert extractedInformation to collectedInformation for compatibility
          responseData.collectedInformation = {
            ...responseData.extractedInformation,
            ...collectedInfo // Preserve any existing collected info
          };
        }
        
        // If we have collectedInformation, make sure it's kept as an object
        if (responseData.collectedInformation) {
          responseData.collectedInformation = {
            ...collectedInfo, // Start with existing info
            ...responseData.collectedInformation // Override with new info
          };
        } else {
          // No collectedInformation field at all, create it
          responseData.collectedInformation = { ...collectedInfo };
        }

        logger.info('Successfully parsed JSON dialog response', {
          isComplete: responseData.isComplete || responseData.isStepComplete || false,
          hasNextQuestion: !!responseData.nextQuestion,
          readyToGenerate: responseData.readyToGenerate || false,
          completionPercentage: responseData.completionPercentage || 0
        });
      } catch (error) {
        logger.error('Error parsing JSON dialog response', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Create a default response if parsing fails
        responseData = {
          isComplete: false,
          collectedInformation: collectedInfo,
          nextQuestion: "I'm having trouble understanding. Could you please be more specific?"
        };
      }

      // Special handling for asset generation - add the generated asset to the chat directly
      // UNIVERSAL DETECTION: Check for asset content regardless of step name
      const isAssetGenerationStep = (
        // Traditional step names
        (step.name === "Generate an Asset" || step.name === "Asset Generation") ||
        // API_CALL steps that are complete and NOT information collection
        (step.stepType === StepType.API_CALL && 
         !step.name.includes("Information Collection") && 
         !step.name.includes("Collection") &&
         (responseData.isComplete || responseData.isStepComplete))
      ) && 
      // Make sure it's not an information collection step
      !step.name.includes("Information Collection") && !step.name.includes("Collection");
      
      // Enhanced content detection - check if response actually contains asset content
      const hasAssetContent = !!(
        responseData.collectedInformation?.asset || 
        responseData.asset ||
        responseData.collectedInformation?.generatedAsset ||
        responseData.generatedAsset ||
        (responseData.nextQuestion && 
         responseData.nextQuestion.length > 500 && 
         (responseData.nextQuestion.includes('**LinkedIn Post:**') || 
          responseData.nextQuestion.includes('**Twitter') ||
          responseData.nextQuestion.includes('FOR IMMEDIATE RELEASE') ||
          responseData.nextQuestion.includes('Here\'s your') ||
          responseData.nextQuestion.includes('# '))) // Common asset formatting
      );
      
      // Final asset detection: Either explicit asset generation step OR has asset content
      const shouldProcessAsset = (isAssetGenerationStep && (responseData.isComplete || responseData.isStepComplete)) || 
                                (hasAssetContent && (responseData.isComplete || responseData.isStepComplete));
      
      // Log potential issues with Information Collection steps generating assets
      if ((step.name.includes("Information Collection") || step.name.includes("Collection")) && 
          (responseData.isComplete || responseData.isStepComplete)) {
        logger.warn('Information Collection step marked as complete - checking for asset content', {
          stepId: step.id,
          stepName: step.name,
          isComplete: responseData.isComplete,
          isStepComplete: responseData.isStepComplete,
          hasAssetContent: !!(responseData.collectedInformation?.asset || responseData.asset),
          responseKeys: Object.keys(responseData),
          collectedInfoKeys: Object.keys(responseData.collectedInformation || {})
        });
        
        // Check if the response incorrectly contains asset content
        const hasAssetContent = responseData.collectedInformation?.asset || 
                               responseData.asset ||
                               responseData.collectedInformation?.generatedAsset ||
                               responseData.generatedAsset ||
                               (responseData.nextQuestion && 
                                responseData.nextQuestion.length > 500 && 
                                (responseData.nextQuestion.includes('**LinkedIn Post:**') || 
                                 responseData.nextQuestion.includes('**Twitter') ||
                                 responseData.nextQuestion.includes('FOR IMMEDIATE RELEASE')));
        
        if (hasAssetContent) {
          logger.error('Information Collection step incorrectly generated asset content', {
            stepId: step.id,
            stepName: step.name,
            assetFound: true,
            responsePreview: openAIResult.responseText.substring(0, 200) + '...'
          });
          
          // SAFETY FIX: Remove asset content from Information Collection responses
          if (responseData.collectedInformation?.asset) {
            delete responseData.collectedInformation.asset;
          }
          if (responseData.asset) {
            delete responseData.asset;
          }
          if (responseData.collectedInformation?.generatedAsset) {
            delete responseData.collectedInformation.generatedAsset;
          }
          if (responseData.generatedAsset) {
            delete responseData.generatedAsset;
          }
          
          // If the nextQuestion contains asset content, replace it with a proper collection question
          if (responseData.nextQuestion && responseData.nextQuestion.length > 500) {
            responseData.nextQuestion = "I need to collect more information about your announcement. Could you provide additional details about your company, the announcement, and any key messaging you'd like to include?";
            responseData.isComplete = false;
            responseData.isStepComplete = false;
          }
          
          logger.info('Cleaned asset content from Information Collection response', {
            stepId: step.id,
            stepName: step.name
          });
        }
      }
      
      // DEBUG: Log asset generation step detection
      logger.info('Universal asset detection analysis', {
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        isAssetGenerationStep,
        hasAssetContent,
        shouldProcessAsset,
        stepNameMatches: (step.name === "Generate an Asset" || step.name === "Asset Generation"),
        isApiCall: step.stepType === StepType.API_CALL,
        notInformationCollection: !step.name.includes("Information Collection") && !step.name.includes("Collection"),
        isComplete: responseData.isComplete,
        isStepComplete: responseData.isStepComplete,
        contentIndicators: {
          hasAssetField: !!(responseData.collectedInformation?.asset || responseData.asset),
          hasGeneratedAssetField: !!(responseData.collectedInformation?.generatedAsset || responseData.generatedAsset),
          hasLongNextQuestion: !!(responseData.nextQuestion && responseData.nextQuestion.length > 500),
          containsAssetMarkers: !!(responseData.nextQuestion && (
            responseData.nextQuestion.includes('**LinkedIn Post:**') || 
            responseData.nextQuestion.includes('**Twitter') ||
            responseData.nextQuestion.includes('FOR IMMEDIATE RELEASE') ||
            responseData.nextQuestion.includes('Here\'s your') ||
            responseData.nextQuestion.includes('# ')
          ))
        }
      });
      
      if (shouldProcessAsset) {
        logger.info('Universal asset processing activated', {
          stepId: step.id,
          stepName: step.name,
          isComplete: responseData.isComplete,
          isStepComplete: responseData.isStepComplete,
          responseDataKeys: Object.keys(responseData),
          collectedInfoKeys: Object.keys(responseData.collectedInformation || {}),
          rawResponseLength: openAIResult.responseText.length,
          rawResponsePreview: openAIResult.responseText.substring(0, 300) + '...'
        });
        
        // Get the asset content from multiple possible locations
        let assetContent = responseData.collectedInformation?.asset || 
                          responseData.asset ||
                          responseData.collectedInformation?.generatedAsset ||
                          responseData.generatedAsset;
        
        // If no asset content found in structured fields, try to extract from the response text
        if (!assetContent && responseData.nextQuestion) {
          // Sometimes the asset content is in the nextQuestion field
          assetContent = responseData.nextQuestion;
        }
        
        // If still no content, try to extract from the raw API response
        if (!assetContent && openAIResult.responseText) {
          try {
            // First try to parse the entire response as JSON and extract the asset field
            try {
              const parsedResponse = JSON.parse(openAIResult.responseText);
              if (parsedResponse.asset) {
                assetContent = parsedResponse.asset;
                logger.info('Extracted asset from parsed JSON response', { contentLength: assetContent.length });
              }
            } catch (jsonParseError) {
              // If full JSON parsing fails, try regex extraction
              const rawResponse = openAIResult.responseText;
              
              logger.info('Full JSON parse failed, attempting regex extraction', {
                responseLength: rawResponse.length,
                responsePreview: rawResponse.substring(0, 200) + '...'
              });
              
              // Look for JSON with asset field (more flexible pattern)
              const assetMatch = rawResponse.match(/"asset":\s*"([^"]*(?:\\.[^"]*)*)"/s);
              if (assetMatch) {
                assetContent = assetMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                logger.info('Extracted asset from JSON pattern', { contentLength: assetContent.length });
              } else {
                // Try to find content between specific markers
                const contentPatterns = [
                  // Look for content after "Here's your" or similar
                  /Here's your.*?:\s*\n\n(.*)/is,
                  // Look for content after asset type mention
                  /Social Post.*?:\s*\n\n(.*)/is,
                  /Press Release.*?:\s*\n\n(.*)/is,
                  /Media Pitch.*?:\s*\n\n(.*)/is,
                  /Blog Post.*?:\s*\n\n(.*)/is,
                  /FAQ.*?:\s*\n\n(.*)/is,
                  // Look for any substantial content block
                  /\n\n([^\n]{100,}(?:\n[^\n]{50,})*)/s
                ];
                
                for (const pattern of contentPatterns) {
                  const match = rawResponse.match(pattern);
                  if (match && match[1]) {
                    assetContent = match[1].trim();
                    logger.info('Extracted asset using pattern matching', { 
                      pattern: pattern.source,
                      contentLength: assetContent.length 
                    });
                    break;
                  }
                }
                
                // Last resort: if response looks like it contains actual content, use it all
                if (!assetContent && rawResponse.length > 200 && !rawResponse.includes('I want to make sure')) {
                  assetContent = rawResponse;
                  logger.info('Using entire response as asset content (fallback)', { 
                    contentLength: assetContent.length 
                  });
                }
              }
            }
          } catch (error) {
            logger.warn('Could not extract asset from raw response', { error });
          }
        }
        
        // Final check: if assetContent still contains JSON structure, try to extract the asset field
        if (assetContent && typeof assetContent === 'string' && assetContent.trim().startsWith('{')) {
          try {
            const parsedAsset = JSON.parse(assetContent);
            if (parsedAsset.asset) {
              logger.info('Extracted clean asset content from JSON structure', {
                originalLength: assetContent.length,
                cleanLength: parsedAsset.asset.length
              });
              assetContent = parsedAsset.asset;
            }
          } catch (finalParseError) {
            // If it looks like JSON but doesn't parse, try regex extraction one more time
            const finalAssetMatch = assetContent.match(/"asset":\s*"([^"]*(?:\\.[^"]*)*)"/s);
            if (finalAssetMatch) {
              const extractedContent = finalAssetMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
              logger.info('Final regex extraction successful', {
                originalLength: assetContent.length,
                cleanLength: extractedContent.length
              });
              assetContent = extractedContent;
            }
          }
        }
        
        if (assetContent) {
          logger.info('Generated asset detected, adding to chat via unified method', {
            stepId: step.id,
            stepName: step.name,
            assetLength: assetContent.length
          });
          
          if (actualThreadId) {
            try {
              // Get asset type from multiple sources with better fallback logic
              let assetType = responseData.collectedInformation?.selectedAssetType ||
                             responseData.collectedInformation?.assetType || 
                             responseData.assetType ||
                             collectedInfo?.selectedAssetType ||
                             collectedInfo?.assetType ||
                             step.metadata?.collectedInformation?.selectedAssetType ||
                             step.metadata?.collectedInformation?.assetType ||
                             "Press Release"; // Default fallback
              
              // Clean up the asset type name if needed
              if (assetType === "PR Asset") {
                assetType = "Press Release";
              }
              
              logger.info('JsonDialogService - Asset type determination', {
                finalAssetType: assetType
              });
              
              // Extract clean display content for the chat message
              let cleanDisplayContent = assetContent;
              
              // ENHANCED: If assetContent is JSON with an "asset" field, extract just the asset content for display
              if (typeof assetContent === 'string' && assetContent.trim().startsWith('{')) {
                try {
                  const parsedAsset = JSON.parse(assetContent);
                  if (parsedAsset.asset) {
                    cleanDisplayContent = parsedAsset.asset;
                    logger.info('Extracted clean display content from JSON wrapper', {
                      originalLength: assetContent.length,
                      cleanLength: cleanDisplayContent.length
                    });
                  }
                } catch (parseError) {
                  logger.warn('Asset content looks like JSON but failed to parse, using as-is', {
                    error: parseError instanceof Error ? parseError.message : 'Unknown error'
                  });
                }
              }
              
              // USE UNIFIED METHOD: Import WorkflowService and use addAssetMessage
              const { WorkflowService } = await import('./workflow.service');
              const workflowService = new WorkflowService();
              
              await workflowService.addAssetMessage(
                actualThreadId,
                cleanDisplayContent,
                assetType,
                step.id,
                step.name,
                {
                  isRevision: false,
                  showCreateButton: true
                }
              );
              
              logger.info('Successfully added asset via unified method', {
                threadId: actualThreadId,
                assetLength: cleanDisplayContent.length,
                assetType,
                method: 'unified_addAssetMessage'
              });
              
              // Store the asset in the response data for consistency
              if (!responseData.collectedInformation) {
                responseData.collectedInformation = {};
              }
              responseData.collectedInformation.asset = cleanDisplayContent; // Store clean content
              responseData.collectedInformation.assetType = assetType;
              
            } catch (error) {
              logger.error('Error adding asset to chat via unified method', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
              });
              // Continue with normal response even if adding to chat failed
            }
          } else {
            logger.warn('Cannot add asset to chat - no threadId available', {
              stepId: step.id,
              stepName: step.name,
              assetLength: assetContent.length
            });
          }
        } else {
          logger.warn('No asset content found in response for asset generation step', {
            stepId: step.id,
            stepName: step.name,
            responseKeys: Object.keys(responseData),
            collectedInfoKeys: Object.keys(responseData.collectedInformation || {}),
            hasNextQuestion: !!responseData.nextQuestion
          });
        }
      }

      // Build the response
      return {
        isStepComplete: responseData.isComplete,
        isComplete: responseData.isComplete, // Include both field names for compatibility
        nextQuestion: responseData.nextQuestion,
        collectedInformation: responseData.collectedInformation || collectedInfo,
        suggestedNextStep: responseData.suggestedNextStep,
        apiResponse: openAIResult.responseText,
        readyToGenerate: responseData.readyToGenerate || false,
        mode: responseData.mode // Preserve mode field for conversational processing
      };
    } catch (error) {
      logger.error('Error in JSON dialog processing', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  /**
   * Get required fields for a specific step type
   */
  private getRequiredFieldsForStep(step: WorkflowStep): any {
    // For workflow selection
    if (step.name === "Workflow Selection") {
      return {
        essential: ["selectedWorkflow"]
      };
    }
    
    // For thread title
    if (step.name === "Thread Title and Summary") {
      return {
        essential: ["threadTitle"]
      };
    }
    
    // For Information Collection steps, prioritize step metadata over hardcoded values
    if (step.name.includes("Information Collection") || step.name.includes("Collection")) {
      // First check if the step has its own essential fields defined
      if (step.metadata?.essential && step.metadata.essential.length > 0) {
        return {
          essential: step.metadata.essential,
          important: step.metadata.important || [],
          optional: step.metadata.optional || []
        };
      }
      
      // Fallback to generic fields only if no step-specific fields are defined
      return {
        essential: ["companyName", "announcementType"],
        important: ["productName", "keyFeatures"],
        optional: ["contactInfo", "quote"]
      };
    }
    
    // Default structure for other steps - always respect step metadata first
    return {
      essential: step.metadata?.essential || [],
      important: step.metadata?.important || [],
      optional: step.metadata?.optional || []
    };
  }

  /**
   * Sanitize collected information to remove sensitive Metabase data before sending to OpenAI
   * CRITICAL SECURITY: No news article content, summaries, URLs, or author data should reach OpenAI
   */
  private sanitizeForOpenAI(collectedInfo: Record<string, any>): Record<string, any> {
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(collectedInfo));
    
    // Remove all Metabase search results and article data
    if (sanitized.searchResults) {
      logger.warn('🚨 SECURITY: Removing Metabase search results from OpenAI context', {
        removedFields: Object.keys(sanitized.searchResults)
      });
      delete sanitized.searchResults;
    }
    
    // Remove author results with article data
    if (sanitized.authorResults) {
      logger.warn('🚨 SECURITY: Removing author results with article data from OpenAI context');
      delete sanitized.authorResults;
    }
    
    // Remove any field containing article data
    const dangerousFields = ['articles', 'articleData', 'metabaseResults', 'databaseResults', 'newsData'];
    dangerousFields.forEach(field => {
      if (sanitized[field]) {
        logger.warn(`🚨 SECURITY: Removing ${field} from OpenAI context`);
        delete sanitized[field];
      }
    });
    
    // Recursively sanitize nested objects
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeForOpenAI(sanitized[key]);
      }
    });
    
    return sanitized;
  }

  /**
   * Create a simple system prompt for the AI
   */
  private createSystemPrompt(
    step: WorkflowStep, 
    goal: string,
    collectedInfo: Record<string, any>,
    conversationHistory: string[] = [],
    currentUserInput: string = "",
    requiredFields: any = {}
  ): string {
    // Format conversation history if provided
    let formattedHistory = '';
    if (conversationHistory.length > 0) {
      // Format conversation history to clearly show user vs assistant messages
      formattedHistory = `\nCONVERSATION HISTORY (for context only):\n${conversationHistory.map((msg, i) => 
        `${i % 2 === 0 ? 'User' : 'Assistant'}: ${msg}`).join('\n')}`;
      
      // Add emphasis on using the history for context
      formattedHistory += `\n\nIMPORTANT: Use the conversation history to understand the full context and avoid asking for information that has already been provided.`;
    }
    
    // Base priority instructions to include in all prompts
    const priorityInstructions = `
PRIORITY INSTRUCTIONS:
1. The user's CURRENT INPUT should be prioritized above all else
2. If the user asks a question, answer it directly
3. If the user says "I don't know" for any information, mark it as UNAVAILABLE and DO NOT ask for it again
4. NEVER ask for information that has already been provided - check conversation history thoroughly
5. Maintain a helpful, flexible conversational style
6. After collecting 60% or more of essential information, suggest generating an asset
7. EXTRACT ALL RELEVANT INFORMATION from the user's input, even if it wasn't directly requested`;
    
    // Special case for workflow selection
    if (step.name === "Workflow Selection") {
      // Get available workflow options
      const options = step.metadata?.options || [];
      
      return `GOAL: ${goal}${priorityInstructions}

AVAILABLE WORKFLOWS:
${options.map((opt: string) => `- "${opt}"`).join('\n')}${formattedHistory}

CURRENT USER INPUT:
"${currentUserInput}"

TASK:
1. Try to match user input to any available workflow
2. IF WORKFLOW MATCHED → return workflow_selection mode with selectedWorkflow
3. IF NO WORKFLOW MATCHED → return conversational mode with conversationalResponse
4. Use simple keyword matching: "PR/press/press release" → "Press Release", "media" → "Media List Generator", etc.
5. Return appropriate JSON response

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If a workflow is matched:
{
  "mode": "workflow_selection",
  "isComplete": true,
  "isMatch": true,
  "collectedInformation": {
    "selectedWorkflow": "EXACT WORKFLOW NAME"
  },
  "nextQuestion": null,
  "suggestedNextStep": "Auto Generate Thread Title"
}

If the user is asking a question or needs help (conversational mode):
{
  "mode": "conversational",
  "isComplete": true,
  "isMatch": false,
  "collectedInformation": {
    "selectedWorkflow": null,
    "conversationalResponse": "Your helpful response using available context"
  },
  "nextQuestion": null,
  "suggestedNextStep": "Auto Generate Thread Title"
}`;
    }
    // Special case for thread title
    else if (step.name === "Thread Title and Summary") {
      return `GOAL: ${goal}${priorityInstructions}${formattedHistory}

CURRENT USER INPUT:
"${currentUserInput}"

TASK:
1. Extract the thread title from the user's message
2. Generate a brief subtitle that enhances the title with additional context
3. If the user is asking a question or needs help, address that directly
4. Return a JSON response

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If the user has provided a title:
{
  "isComplete": true,
  "collectedInformation": {
    "threadTitle": "EXACT TITLE FROM USER",
    "subtitle": "Your generated subtitle here"
  },
  "nextQuestion": null,
  "suggestedNextStep": null
}

If the user is asking a question or needs help:
{
  "isComplete": false,
  "collectedInformation": {},
  "nextQuestion": "Your helpful response to their question or statement",
  "suggestedNextStep": null
}`;
    }
    // Default case for other steps - particularly important for information gathering steps
    else {
      // Special handling for Information Collection steps AND Author Ranking & Selection step - use their baseInstructions but include context
      if (step.name.includes("Information Collection") || step.name.includes("Collection") || step.name === "Author Ranking & Selection") {
        const baseInstructions = step.metadata?.baseInstructions;
        if (baseInstructions) {
          // CRITICAL SECURITY: Sanitize collected information before sending to OpenAI
          const sanitizedInfo = this.sanitizeForOpenAI(collectedInfo);
          
          // Include the sanitized collected information context in the baseInstructions
          const contextSection = Object.keys(sanitizedInfo).length > 0 
            ? `\n\nCONTEXT FROM PREVIOUS STEPS (SANITIZED):\n${JSON.stringify(sanitizedInfo, null, 2)}\n\nCRITICAL INSTRUCTIONS FOR INFORMATION COLLECTION:\n- You are in the INFORMATION COLLECTION phase, NOT the asset generation phase\n- Your task is ONLY to collect information needed for future asset generation\n- DO NOT generate any assets (press releases, social posts, media pitches, etc.)\n- DO NOT create any final content - only gather the required information\n- Ask follow-up questions to collect missing information\n- Use the context above to understand what has already been established (announcement type, asset type, etc.)\n- Once you have sufficient information, mark the step as complete to move to the Asset Generation phase\n- NEVER include generated asset content in your response`
            : '';
          
          // For Author Ranking & Selection, don't add the information collection instructions
          if (step.name === "Author Ranking & Selection") {
            return baseInstructions + formattedHistory;
          } else {
            return baseInstructions + contextSection + formattedHistory;
          }
        }
      }
      
      // Calculate what information we already have vs what we still need
      const infoTracking = this.generateInfoTrackingStatus(collectedInfo, requiredFields);
      
      // CRITICAL SECURITY: Sanitize collected information before sending to OpenAI
      const sanitizedInfo = this.sanitizeForOpenAI(collectedInfo);
      
      return `GOAL: ${goal}${priorityInstructions}

CURRENT COLLECTED INFORMATION (SANITIZED):
${JSON.stringify(sanitizedInfo, null, 2)}

INFORMATION TRACKING STATUS:
${infoTracking.formattedStatus}${formattedHistory}

CURRENT USER INPUT:
"${currentUserInput}"

TASK:
1. Respond directly to the user's current input above all else
2. If the user is asking a question, answer it rather than sticking to information collection
3. If the user says "I don't know" to a question, mark that field as UNAVAILABLE and do not ask again
4. Use the conversation history to ensure you never ask for information already provided
5. IMPORTANT: Extract ALL relevant information from the current message, even if it wasn't directly asked for in your last question
6. Look for information that might be relevant for ANY workflow step, not just the current focus
7. If you detect information that might be useful for a future step, store it in the appropriate field in collectedInformation
8. If 60% or more of essential information is collected, offer to proceed with generation
9. Return a JSON response

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If all essential information is collected:
{
  "isComplete": true,
  "collectedInformation": {
    // All collected information including new info from this message
  },
  "nextQuestion": null,
  "suggestedNextStep": null,
  "completionPercentage": 100
}

If 60% or more of essential information is collected:
{
  "isComplete": false,
  "collectedInformation": {
    // All collected information including new info from this message  
  },
  "nextQuestion": "I have enough information to generate your [asset type]. Would you like to proceed, or would you like to provide more details about [missing fields]?",
  "suggestedNextStep": null,
  "readyToGenerate": true,
  "completionPercentage": 75,
  "missingFields": ["list", "of", "missing", "fields"]
}

If the user is asking a question or making a statement that needs direct response:
{
  "isComplete": false,
  "collectedInformation": {
    // Keep the previously collected information, update with any new info from their message
    // IMPORTANT: Even if responding to a question, still extract and store ANY relevant information
  },
  "nextQuestion": "Your direct answer to the user's question or comment",
  "suggestedNextStep": null,
  "completionPercentage": ${infoTracking.completionPercentage}
}

If more information is needed and under 60% complete:
{
  "isComplete": false,
  "collectedInformation": {
    // All information collected so far plus ANY new information from this message
  },
  "nextQuestion": "Ask for most important missing information - NEVER repeat questions for data already provided",
  "suggestedNextStep": null,
  "completionPercentage": ${infoTracking.completionPercentage},
  "missingFields": ["list", "of", "missing", "fields"]
}`;
    }
  }
  
  /**
   * Generate structured information tracking status
   */
  private generateInfoTrackingStatus(collectedInfo: Record<string, any>, requiredFields: any): { 
    formattedStatus: string, 
    completionPercentage: number 
  } {
    const essentialFields = requiredFields.essential || [];
    const importantFields = requiredFields.important || [];
    const optionalFields = requiredFields.optional || [];
    
    // Flatten collected info into a single level object for easier checking
    const flattenedInfo = this.flattenObject(collectedInfo);
    
    // Track completion for essential fields
    const essentialStatus = this.trackFieldStatus(essentialFields, flattenedInfo);
    const importantStatus = this.trackFieldStatus(importantFields, flattenedInfo);
    const optionalStatus = this.trackFieldStatus(optionalFields, flattenedInfo);
    
    // Calculate completion percentage (weight essential fields more heavily)
    const essentialWeight = 0.7;
    const importantWeight = 0.2;
    const optionalWeight = 0.1;
    
    let completionPercentage = 0;
    
    // Only calculate if there are fields defined
    if (essentialFields.length > 0) {
      completionPercentage += essentialWeight * (essentialStatus.complete / Math.max(1, essentialFields.length));
    }
    
    if (importantFields.length > 0) {
      completionPercentage += importantWeight * (importantStatus.complete / Math.max(1, importantFields.length));
    }
    
    if (optionalFields.length > 0) {
      completionPercentage += optionalWeight * (optionalStatus.complete / Math.max(1, optionalFields.length));
    }
    
    // Format the status message
    let formattedStatus = `
ESSENTIAL INFORMATION (${essentialStatus.complete}/${essentialFields.length} complete):
${this.formatFieldStatus(essentialFields, flattenedInfo)}

IMPORTANT INFORMATION (${importantStatus.complete}/${importantFields.length} complete):
${this.formatFieldStatus(importantFields, flattenedInfo)}

OPTIONAL INFORMATION (${optionalStatus.complete}/${optionalFields.length} complete):
${this.formatFieldStatus(optionalFields, flattenedInfo)}

COMPLETION STATUS: ${Math.round(completionPercentage * 100)}% complete
${completionPercentage >= 0.6 ? "READY TO SUGGEST GENERATION: YES" : "READY TO SUGGEST GENERATION: NO"}`;
    
    return {
      formattedStatus,
      completionPercentage: Math.round(completionPercentage * 100)
    };
  }
  
  /**
   * Track status of fields - how many are complete
   * Uses flexible matching to find information even if field names don't match exactly
   */
  private trackFieldStatus(fields: string[], flattenedInfo: Record<string, any>): {
    complete: number,
    missing: number
  } {
    let complete = 0;
    
    fields.forEach(field => {
      // Create variants of the field name to check
      const fieldVariants = [
        field,
        field.toLowerCase(),
        field.replace(/([A-Z])/g, ' $1').trim(), // Convert camelCase to spaces
        field.replace(/\s+/g, ''), // Remove spaces
        field.replace(/[_-]/g, '') // Remove underscores and hyphens
      ];
      
      // Check if field exists in any variant form
      const fieldExists = Object.keys(flattenedInfo).some(key => {
        const keyLower = key.toLowerCase();
        
        // Check for direct inclusion of field variants in key
        const directMatch = fieldVariants.some(variant => 
          keyLower.includes(variant.toLowerCase())
        );
        
        // Check for semantic similarity (words appear in different order)
        const fieldWords = field.toLowerCase().split(/\W+/);
        const keyWords = keyLower.split(/\W+/);
        const semanticMatch = fieldWords.length > 1 && 
          fieldWords.every(word => 
            word.length > 2 && keyWords.some(keyWord => keyWord.includes(word))
          );
        
        // Check value is valid
        const hasValidValue = flattenedInfo[key] !== null && 
                             flattenedInfo[key] !== undefined &&
                             flattenedInfo[key] !== "" &&
                             flattenedInfo[key] !== "unknown" &&
                             flattenedInfo[key] !== "unavailable";
                             
        return (directMatch || semanticMatch) && hasValidValue;
      });
      
      if (fieldExists) {
        complete++;
      }
    });
    
    return {
      complete,
      missing: fields.length - complete
    };
  }
  
  /**
   * Format field status for display
   * Provides clear information on what fields are provided, missing, or unavailable
   */
  private formatFieldStatus(fields: string[], flattenedInfo: Record<string, any>): string {
    if (fields.length === 0) {
      return "None defined";
    }
    
    return fields.map(field => {
      // Create variants of the field name to check
      const fieldVariants = [
        field,
        field.toLowerCase(),
        field.replace(/([A-Z])/g, ' $1').trim(), // Convert camelCase to spaces
        field.replace(/\s+/g, ''), // Remove spaces
        field.replace(/[_-]/g, '') // Remove underscores and hyphens
      ];
      
      // Find all matching keys in collectedInfo
      const matchingKeys = Object.keys(flattenedInfo).filter(key => {
        const keyLower = key.toLowerCase();
        
        // Check for direct inclusion of field variants in key
        return fieldVariants.some(variant => keyLower.includes(variant.toLowerCase()));
      });
      
      if (matchingKeys.length > 0) {
        // Take the first matching key (could be improved to take best match)
        const key = matchingKeys[0];
        const value = flattenedInfo[key];
        
        if (value === "unavailable" || value === "unknown") {
          return `- ${field}: MARKED UNAVAILABLE (user doesn't know)`;
        } else if (value) {
          const displayValue = typeof value === 'string' && value.length > 30 
            ? value.substring(0, 30) + '...' 
            : Array.isArray(value) ? `[${value.length} items]` : value;
          
          return `- ${field}: PROVIDED ✓ (${displayValue})`;
        }
      }
      
      // Also check for semantic matches
      const semanticMatches = Object.keys(flattenedInfo).filter(key => {
        const keyLower = key.toLowerCase();
        const fieldWords = field.toLowerCase().split(/\W+/);
        const keyWords = keyLower.split(/\W+/);
        
        // Words appear in any order
        return fieldWords.length > 1 && 
          fieldWords.every(word => 
            word.length > 2 && keyWords.some(keyWord => keyWord.includes(word))
          );
      });
      
      if (semanticMatches.length > 0) {
        const key = semanticMatches[0];
        const value = flattenedInfo[key];
        
        if (value && value !== "unavailable" && value !== "unknown") {
          const displayValue = typeof value === 'string' && value.length > 30 
            ? value.substring(0, 30) + '...' 
            : Array.isArray(value) ? `[${value.length} items]` : value;
            
          return `- ${field}: LIKELY PROVIDED ✓ (as "${key}": ${displayValue})`;
        }
      }
      
      return `- ${field}: MISSING (needs attention)`;
    }).join('\n');
  }
  
  /**
   * Flatten a nested object into a single level with dot notation paths
   * This helps with detecting information regardless of where it's stored in the structure
   */
  private flattenObject(obj: any, prefix: string = ''): Record<string, any> {
    if (!obj || typeof obj !== 'object') {
      return {};
    }
    
    return Object.keys(obj).reduce((acc, key) => {
      const prefixedKey = prefix ? `${prefix}.${key}` : key;
      
      if (Array.isArray(obj[key])) {
        // Handle arrays by flattening each element and adding array index to key
        obj[key].forEach((item: any, index: number) => {
          if (typeof item === 'object' && item !== null) {
            // For object items in arrays, flatten them with indexed keys
            Object.assign(acc, this.flattenObject(item, `${prefixedKey}[${index}]`));
          } else {
            // For primitive items, store with indexed key
            acc[`${prefixedKey}[${index}]`] = item;
          }
        });
        
        // Also store the entire array with the original key
        acc[prefixedKey] = obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Handle nested objects by recursively flattening
        Object.assign(acc, this.flattenObject(obj[key], prefixedKey));
      } else {
        // Handle primitive values
        acc[prefixedKey] = obj[key];
      }
      
      return acc;
    }, {} as Record<string, any>);
  }

  /**
   * Update step metadata
   */
  private async updateStepMetadata(stepId: string, metadata: any): Promise<void> {
    try {
      // Import required modules inline to avoid circular dependencies
      const { db } = await import('../db');
      const { workflowSteps } = await import('../db/schema');
      const { eq } = await import('drizzle-orm');
      
      // Update the step metadata
      await db.update(workflowSteps)
        .set({ metadata })
        .where(eq(workflowSteps.id, stepId));
      
      logger.info(`Updated metadata for step ${stepId}`);
    } catch (error) {
      logger.error('Error updating step metadata', { 
        stepId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
} 