import logger from '../../utils/logger';
import { Workflow, WorkflowStep, StepStatus } from '../../types/workflow';

/**
 * Workflow Utilities
 * 
 * This file contains utility functions for workflow processing that are
 * shared across different workflow handlers and services.
 */

export class WorkflowUtilities {
  
  /**
   * Sanitize collected information before sending to OpenAI (removes sensitive data)
   */
  static sanitizeForOpenAI(collectedInfo: any): any {
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(collectedInfo));
    
    // Remove all Metabase search results and article data
    if (sanitized.searchResults) {
      logger.warn('🚨 SECURITY: Removing Metabase search results from OpenAI context in asset generation', {
        removedFields: Object.keys(sanitized.searchResults)
      });
      delete sanitized.searchResults;
    }
    
    // Remove author results with article data
    if (sanitized.authorResults) {
      logger.warn('🚨 SECURITY: Removing author results with article data from OpenAI context in asset generation');
      delete sanitized.authorResults;
    }
    
    // Remove any field containing article data
    const dangerousFields = ['articles', 'articleData', 'metabaseResults', 'databaseResults', 'newsData'];
    dangerousFields.forEach(field => {
      if (sanitized[field]) {
        logger.warn(`🚨 SECURITY: Removing ${field} from OpenAI context in asset generation`);
        delete sanitized[field];
      }
    });
    
    // Recursively sanitize nested objects
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = WorkflowUtilities.sanitizeForOpenAI(sanitized[key]);
      }
    });
    
    return sanitized;
  }

  /**
   * Format collected information for asset generation in a structured way
   */
  static formatJsonInfoForAsset(collectedInfo: any, assetType: string, conversationHistory: string[] = []): string {
    // CRITICAL SECURITY: Sanitize collected information before sending to OpenAI
    const sanitizedInfo = WorkflowUtilities.sanitizeForOpenAI(collectedInfo);
    
    // Create a structured prompt from the sanitized collected information
    let prompt = `GENERATE A ${assetType.toUpperCase()}\n\n`;
    
    // Add the sanitized JSON structure for consistent formatting
    prompt += `COLLECTED INFORMATION (SANITIZED):\n${JSON.stringify(sanitizedInfo, null, 2)}\n\n`;
    
    // Add conversation history context if available
    if (conversationHistory && conversationHistory.length > 0) {
      // Format the conversation history to make it more useful
      const formattedHistory = conversationHistory.map((msg, i) => 
        `${i % 2 === 0 ? 'User' : 'Assistant'}: ${msg}`
      ).join('\n');
      
      prompt += `CONVERSATION HISTORY FOR CONTEXT:\n${formattedHistory}\n\n`;
    }
    
    // Add additional instruction for proper output format
    prompt += `RESPONSE FORMAT:\nReturn a JSON object with the asset content as specified in the instructions. The response MUST be valid JSON with an "asset" field containing the generated content.\n`;
    prompt += `Example: {"asset": "Your generated content here..."}\n\n`;
    
    // Add emphasis on using all available information
    prompt += `IMPORTANT: Use ALL relevant information from both the collected information and conversation history to create the most complete and accurate ${assetType} possible.\n`;
    
    return prompt;
  }

  /**
   * Gather context from previous steps in workflow
   */
  static async gatherPreviousStepsContext(workflow: Workflow): Promise<Record<string, any>> {
    const context: Record<string, any> = {};
    
    // Get all steps that have useful information, sorted by order
    // Include both completed steps AND steps that have collected information or AI suggestions
    const informativeSteps = workflow.steps
      .filter((s: any) => 
        s.status === StepStatus.COMPLETE || 
        s.metadata?.collectedInformation || 
        s.aiSuggestion
      )
      .sort((a: any, b: any) => a.order - b.order);
    
    for (const step of informativeSteps) {
      // Extract information from different step types
      if (step.metadata?.collectedInformation) {
        // Merge collected information from JSON Dialog steps
        Object.assign(context, step.metadata.collectedInformation);
      }
      
      if (step.aiSuggestion) {
        // Store AI suggestions with step name as key
        const stepKey = step.name.toLowerCase().replace(/\s+/g, '');
        context[stepKey] = step.aiSuggestion;
        
        // Also store with semantic keys for common step types
        if (step.name === "Asset Type Selection") {
          context.assetType = step.aiSuggestion;
          context.selectedAssetType = step.aiSuggestion;
        } else if (step.name === "Announcement Type Selection") {
          context.announcementType = step.aiSuggestion;
        } else if (step.name === "Workflow Selection") {
          context.selectedWorkflow = step.aiSuggestion;
        }
      }
      
      if (step.userInput) {
        // Store user inputs with step name as key
        const stepKey = step.name.toLowerCase().replace(/\s+/g, '') + 'Input';
        context[stepKey] = step.userInput;
      }
    }
    
    logger.info('Gathered context from previous steps', {
      workflowId: workflow.id,
      informativeStepsCount: informativeSteps.length,
      contextKeys: Object.keys(context),
      announcementType: context.announcementType,
      assetType: context.assetType || context.selectedAssetType,
      fullContext: context
    });
    
    return context;
  }

  /**
   * Extract conversation history from workflow messages (if available)
   */
  static async getThreadConversationHistory(threadId: string, limit: number = 50): Promise<string[]> {
    // This would typically fetch from chat messages table
    // For now, return empty array - can be implemented later
    logger.info('Getting conversation history for thread', { threadId, limit });
    return [];
  }

  /**
   * Enhanced Input Intent Analysis (migrated from UnifiedEngine)
   */
  static analyzeInputIntent(userInput: string | { type: string; text: string; decorators?: any[] }): {
    type: 'conversational' | 'workflow_selection' | 'workflow_action' | 'regular';
    isConversational: boolean;
    shouldResetWorkflow: boolean;
    workflowName?: string;
    workflowType?: string;
  } {
    // Handle structured content
    if (typeof userInput === 'object' && userInput.type === 'workflow_action') {
      const workflowType = userInput.decorators?.find(d => d.type === 'workflow_start')?.data?.workflowType;
      return {
        type: 'workflow_action',
        isConversational: false,
        shouldResetWorkflow: true,
        workflowType,
        workflowName: workflowType
      };
    }

    const input = (typeof userInput === 'string' ? userInput : userInput.text).toLowerCase().trim();
    
    // Check for conversational/help/informational requests first (higher priority)
    const conversationalPatterns = [
      'what can i do', '?', 'help', 'list', 'options',
      'what is', 'what are', 'can you describe', 'tell me about', 
      'explain', 'how does', 'how do', 'what does', 'describe'
    ];
    
    if (conversationalPatterns.some(pattern => input.includes(pattern))) {
      return {
        type: 'conversational',
        isConversational: true,
        shouldResetWorkflow: false
      };
    }
    
    // Check for direct workflow creation requests (action-oriented)
    const workflowActionPatterns = {
      'create a press release': 'Press Release',
      'make a press release': 'Press Release',
      'do a press release': 'Press Release',
      'write a press release': 'Press Release',
      'press release': 'Press Release', // Keep as fallback but lower priority
      
      'create a blog article': 'Blog Article',
      'write a blog article': 'Blog Article', 
      'blog article': 'Blog Article',
      
      'create a social post': 'Social Post',
      'make a social post': 'Social Post',
      'write a social post': 'Social Post',
      'social post': 'Social Post', // Only if not already caught as conversational
      
      'create a media pitch': 'Media Pitch',
      'write a media pitch': 'Media Pitch',
      'media pitch': 'Media Pitch',
      
      'create media matching': 'Media Matching',
      'media matching': 'Media Matching',
      'generate media list': 'Media Matching',
      'create media list': 'Media Matching',
      'media list': 'Media Matching',
      
      'launch announcement': 'Launch Announcement',
      'create an faq': 'FAQ',
      'make an faq': 'FAQ',
      'faq': 'FAQ'
    };
    
    // Check action-oriented patterns first (more specific)
    for (const [pattern, workflowName] of Object.entries(workflowActionPatterns)) {
      if (input.includes(pattern) && !conversationalPatterns.some(cp => input.includes(cp))) {
        return {
          type: 'workflow_action',
          isConversational: false,
          shouldResetWorkflow: true,
          workflowName,
          workflowType: workflowName
        };
      }
    }
    
    // Default to regular input
    return {
      type: 'regular',
      isConversational: false,
      shouldResetWorkflow: false
    };
  }

  /**
   * Determine if user input indicates a workflow selection (legacy method for compatibility)
   */
  static isWorkflowSelection(userInput: string): { isSelection: boolean; workflowName?: string } {
    const intent = this.analyzeInputIntent(userInput);
    return {
      isSelection: intent.type === 'workflow_selection',
      workflowName: intent.workflowName
    };
  }

  /**
   * Extract workflow selection from AI response JSON
   */
  static extractWorkflowSelection(aiResponse: string): { workflowSelected?: string; isConversational?: boolean; conversationalResponse?: string } {
    try {
      // Clean markdown code blocks from AI response (like the original service does)
      let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Try to parse JSON, with fallback for common formatting issues
      let parsed;
      try {
        parsed = JSON.parse(cleanedResponse);
      } catch (jsonError) {
        // If parsing fails, try to fix common JSON issues with unescaped newlines
        // The specific pattern we're seeing is: "conversationalResponse": "text with\nliteral newlines"
        let fixedResponse = cleanedResponse
          // Fix unescaped newlines within JSON string values
          .replace(/(":\s*")([^"]*?)(\n)([^"]*?")/g, (match, prefix, before, newline, after) => {
            return prefix + before + '\\n' + after;
          })
          // Handle multiple newlines in sequence
          .replace(/\\n\n/g, '\\n\\n')
          // Clean up any remaining literal newlines that break JSON structure
          .replace(/\n(?=\s*[}])/g, '\\n');
        
        try {
          parsed = JSON.parse(fixedResponse);
          logger.info('✅ Fixed JSON parsing with newline cleanup', {
            originalLength: cleanedResponse.length,
            fixedLength: fixedResponse.length,
            fixAttempt: 'targeted_newline_fix'
          });
        } catch (secondError) {
          // If still failing, try the aggressive approach
          try {
            const aggressiveFix = cleanedResponse.replace(/\n/g, '\\n');
            parsed = JSON.parse(aggressiveFix);
            logger.info('✅ Fixed JSON parsing with aggressive newline replacement', {
              originalLength: cleanedResponse.length,
              fixedLength: aggressiveFix.length,
              fixAttempt: 'aggressive_replace'
            });
          } catch (thirdError) {
            // If everything fails, throw the original error
            throw jsonError;
          }
        }
      }
      
      if (parsed.selectedWorkflow) {
        return { workflowSelected: parsed.selectedWorkflow };
      }
      
      if (parsed.conversationalResponse) {
        return { 
          isConversational: true,
          conversationalResponse: parsed.conversationalResponse 
        };
      }
      
      // Also check for nested conversationalResponse in collectedInformation
      if (parsed.collectedInformation?.conversationalResponse) {
        return { 
          isConversational: true,
          conversationalResponse: parsed.collectedInformation.conversationalResponse 
        };
      }
      
      return {};
    } catch (error) {
      logger.warn('Could not parse AI response as JSON for workflow selection', { 
        aiResponse: aiResponse.substring(0, 200) + '...',
        fullResponseLength: aiResponse.length,
        fullResponse: aiResponse,
        parseError: error instanceof Error ? error.message : 'Unknown error'
      });
      return {};
    }
  }

  /**
   * Map workflow name to template ID
   */
  static getTemplateIdForWorkflow(workflowName: string): string | null {
    const templateMap: Record<string, string> = {
      'Press Release': '00000000-0000-0000-0000-000000000008',
      'Media Pitch': '00000000-0000-0000-0000-000000000009',
      'Social Post': '00000000-0000-0000-0000-000000000010',
      'Blog Article': '00000000-0000-0000-0000-000000000011',
      'FAQ': '00000000-0000-0000-0000-000000000012',
      'Media Matching': '00000000-0000-0000-0000-000000000006',
      'Launch Announcement': '00000000-0000-0000-0000-000000000002',
      'JSON Dialog PR Workflow': '00000000-0000-0000-0000-000000000003',
      'Test Step Transitions': '00000000-0000-0000-0000-000000000004',
  
    };
    
    return templateMap[workflowName] || null;
  }
} 