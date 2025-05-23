import { WorkflowStep, StepStatus } from '../types/workflow';
import { OpenAIService } from './openai.service';
import logger from '../utils/logger';

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
    conversationHistory: string[] = []
  ): Promise<{
    isStepComplete: boolean;
    nextQuestion?: string;
    collectedInformation: Record<string, any>;
    suggestedNextStep?: string;
    apiResponse: string;
    readyToGenerate?: boolean;
  }> {
    try {
      logger.info('Processing JSON dialog message', {
        stepId: step.id,
        stepName: step.name,
        historyLength: conversationHistory.length,
        userInputLength: userInput.length
      });

      // Special handling for the "Generate an Asset" step - send a "generating" message
      if ((step.name === "Generate an Asset" || step.name === "Asset Generation") && !userInput.includes("INTERNAL_SYSTEM_PROMPT")) {
        // Set userInput to include a system flag to avoid infinite recursion
        const systemPrompt = `${userInput}\n\nINTERNAL_SYSTEM_PROMPT: This is the final user input for generating the press release.`;
        
        // Import dependencies without causing circular imports
        const { db } = await import('../db');
        const { chatMessages } = await import('../db/schema');
        
        try {
          // Insert a "generating" message before starting the process
          await db.insert(chatMessages)
            .values({
              threadId: step.workflowId, // In this context workflowId is used as threadId
              content: "Generating your PR asset now. This may take a moment...",
              role: "assistant",
              userId: "system"
            });
            
          logger.info('Added generating message to chat', { threadId: step.workflowId });
        } catch (error) {
          logger.error('Error adding generating message to chat', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Continue even if the message couldn't be added
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
        responseData = JSON.parse(openAIResult.responseText);
        
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
      if ((step.name === "Generate an Asset" || step.name === "Asset Generation") && 
          (responseData.isComplete || responseData.isStepComplete) && 
          (responseData.collectedInformation?.asset || responseData.asset)) {
        logger.info('Generated asset detected, adding to chat', {
          stepId: step.id,
          stepName: step.name,
          // Handle both response formats
          assetLength: (responseData.collectedInformation?.asset || responseData.asset || '').length
        });
        
        try {
          // Import dependencies without causing circular imports
          const { db } = await import('../db');
          const { chatMessages } = await import('../db/schema');
          
          // Get the asset from either location
          const assetContent = responseData.collectedInformation?.asset || responseData.asset;
          const assetType = responseData.collectedInformation?.assetType || responseData.assetType || "PR Asset";
          
          // Add the generated asset as a direct message
          await db.insert(chatMessages)
            .values({
              threadId: step.workflowId, // In this context workflowId is used as threadId
              content: `Here's your generated ${assetType}:\n\n${assetContent}`,
              role: "assistant",
              userId: "system"
            });
          
          logger.info('Successfully added PR asset to chat', {
            threadId: step.workflowId,
            assetLength: assetContent.length
          });
          
          // If the asset was directly on responseData, move it to collectedInformation for consistency
          if (!responseData.collectedInformation?.asset && responseData.asset) {
            responseData.collectedInformation = responseData.collectedInformation || {};
            responseData.collectedInformation.asset = responseData.asset;
            responseData.collectedInformation.assetType = responseData.assetType;
          }
        } catch (error) {
          logger.error('Error adding press release to chat', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
          // Continue with normal response even if adding to chat failed
        }
      }

      // Build the response
      return {
        isStepComplete: responseData.isComplete,
        nextQuestion: responseData.nextQuestion,
        collectedInformation: responseData.collectedInformation || collectedInfo,
        suggestedNextStep: responseData.suggestedNextStep,
        apiResponse: openAIResult.responseText,
        readyToGenerate: responseData.readyToGenerate || false
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
    
    // For any information collection step - use generic fields
    if (step.name.includes("Information Collection") || step.name.includes("Collection")) {
      return {
        essential: ["companyName", "announcementType"],
        important: ["productName", "keyFeatures"],
        optional: ["contactInfo", "quote"]
      };
    }
    
    // Default structure for other steps
    return {
      essential: step.metadata?.essential || [],
      important: step.metadata?.important || [],
      optional: step.metadata?.optional || []
    };
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
6. After collecting 70% or more of essential information, suggest generating an asset
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
1. Determine which workflow the user wants based on their message
2. Match keywords like "PR/press" to "JSON Dialog PR Workflow", "launch/product" to "Launch Announcement", and "test/dummy" to "Dummy Workflow"
3. If the user is asking a question or saying they don't know, address that first rather than forcing a workflow selection
4. Return a JSON response

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If the user has clearly selected a workflow:
{
  "isComplete": true,
  "collectedInformation": {
    "selectedWorkflow": "EXACT WORKFLOW NAME"
  },
  "nextQuestion": null,
  "suggestedNextStep": "Thread Title and Summary"
}

If the user has NOT clearly selected a workflow but you need to ask for clarification:
{
  "isComplete": false,
  "collectedInformation": {},
  "nextQuestion": "Which workflow would you like to use? Please choose from: ${options.join(', ')}",
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
      // Calculate what information we already have vs what we still need
      const infoTracking = this.generateInfoTrackingStatus(collectedInfo, requiredFields);
      
      return `GOAL: ${goal}${priorityInstructions}

CURRENT COLLECTED INFORMATION:
${JSON.stringify(collectedInfo, null, 2)}

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
8. If 70% or more of essential information is collected, offer to proceed with generation
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
  "suggestedNextStep": "Asset Generation",
  "completionPercentage": 100
}

If 70% or more of essential information is collected:
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

If more information is needed and under 70% complete:
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
${completionPercentage >= 0.7 ? "READY TO SUGGEST GENERATION: YES" : "READY TO SUGGEST GENERATION: NO"}`;
    
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