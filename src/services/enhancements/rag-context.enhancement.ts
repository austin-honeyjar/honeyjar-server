import { ragService } from '../ragService';
import { WorkflowStep, Workflow } from '../../types/workflow';
import { SmartDefaults } from './workflow-types.enhancement';
import logger from '../../utils/logger';

/**
 * RAG Context Enhancement Module
 * Provides context-aware functionality for workflows
 */

export class RAGContextEnhancer {
  private ragService = ragService;

  /**
   * Enhance step with user context and smart defaults
   */
  enhanceStepWithContext(
    step: WorkflowStep, 
    smartDefaults: SmartDefaults, 
    relatedConversations: any[]
  ): WorkflowStep {
    let enhancedPrompt = step.prompt || '';

    // Add company context if available
    if (smartDefaults.companyName) {
      enhancedPrompt += `\n\n📋 SMART CONTEXT:\nCompany: ${smartDefaults.companyName}`;
      if (smartDefaults.industry) {
        enhancedPrompt += `\nIndustry: ${smartDefaults.industry}`;
      }
      if (smartDefaults.preferredTone) {
        enhancedPrompt += `\nPreferred tone: ${smartDefaults.preferredTone}`;
      }
    }

    // Add suggested content if available
    if (smartDefaults.suggestedContent) {
      enhancedPrompt += `\n\n💡 SUGGESTION:\n${smartDefaults.suggestedContent}`;
    }

    // Add context from related examples
    if (smartDefaults.relatedExamples && smartDefaults.relatedExamples.length > 0) {
      enhancedPrompt += `\n\n🎯 RELATED EXAMPLES:\nBased on your previous successful work:`;
      smartDefaults.relatedExamples.slice(0, 2).forEach((example: any, index: number) => {
        enhancedPrompt += `\n${index + 1}. ${example.context}: "${example.content.slice(0, 100)}..."`;
      });
    }

    return { ...step, prompt: enhancedPrompt };
  }

  /**
   * Generate context-aware suggestions for a step
   */
  generateStepSuggestions(ragContext: any): string[] {
    const suggestions: string[] = [];
    
    if (ragContext.userDefaults?.companyName) {
      suggestions.push(`Use "${ragContext.userDefaults.companyName}" as the company name`);
    }
    
    if (ragContext.userDefaults?.industry) {
      suggestions.push(`Target the ${ragContext.userDefaults.industry} industry`);
    }
    
    if (ragContext.userDefaults?.preferredTone) {
      suggestions.push(`Apply ${ragContext.userDefaults.preferredTone} tone`);
    }
    
    if (ragContext.relatedConversations?.length > 0) {
      suggestions.push(`Reference previous similar work`);
    }
    
    if (ragContext.similarAssets?.length > 0) {
      suggestions.push(`Adapt from successful previous assets`);
    }
    
    return suggestions;
  }

  /**
   * Get enhanced context for a workflow step
   */
  async getStepContext(
    userId: string,
    orgId: string,
    workflowType: string,
    stepName: string,
    userInput: string
  ) {
    try {
      const ragContext = await this.ragService.getRelevantContext(
        userId,
        orgId,
        workflowType,
        stepName,
        userInput
      );

      return {
        smartDefaults: ragContext.userDefaults || {},
        relatedContent: [...(ragContext.relatedConversations || []), ...(ragContext.similarAssets || [])],
        suggestions: this.generateStepSuggestions(ragContext),
        userProfile: ragContext.userDefaults
      };
    } catch (error) {
      logger.error('Error getting step context', { error, userId, stepName });
      return {
        smartDefaults: {},
        relatedContent: [],
        suggestions: [],
        userProfile: {}
      };
    }
  }

  /**
   * Get smart defaults for workflow initialization
   */
  async getSmartDefaults(userId: string, orgId: string, workflowType: string): Promise<SmartDefaults> {
    try {
      return await this.ragService.getSmartDefaults(userId, orgId, workflowType);
    } catch (error) {
      logger.error('Error getting smart defaults', { error, userId, workflowType });
      return {};
    }
  }

  /**
   * Enhance first step with smart defaults
   */
  async enhanceFirstStepWithDefaults(
    step: WorkflowStep, 
    smartDefaults: SmartDefaults,
    updateStepFn: (stepId: string, updates: any) => Promise<WorkflowStep>
  ): Promise<void> {
    try {
      // Build contextual prompt
      let enhancedPrompt = step.prompt || '';

      if (smartDefaults.companyName) {
        enhancedPrompt += `\n\n🚀 WELCOME BACK!\nI remember you're working with ${smartDefaults.companyName}`;
        
        if (smartDefaults.industry) {
          enhancedPrompt += ` in the ${smartDefaults.industry} industry`;
        }
        
        enhancedPrompt += `. I can pre-fill some information to save you time.`;
        
        if (smartDefaults.suggestedContent) {
          enhancedPrompt += `\n\n💡 SMART SUGGESTION:\n${smartDefaults.suggestedContent}`;
        }
      }

      // Update step metadata with smart defaults
      await updateStepFn(step.id, {
        metadata: {
          ...step.metadata,
          smartDefaults,
          ragEnhanced: true,
          enhancedPrompt // Store the enhanced prompt in metadata
        }
      });

      logger.info(`Enhanced first step ${step.id} with smart defaults`);
    } catch (error) {
      logger.error('Error enhancing first step', { error, stepId: step.id });
    }
  }

  /**
   * Extract workflow knowledge from completed workflow
   */
  extractWorkflowKnowledge(workflow: Workflow): any {
    const knowledge: any = {};
    
    // Extract common fields from completed steps
    for (const step of workflow.steps) {
      if (step.status === 'complete' && step.openAIResponse) {
        // Parse step responses for company information
        if (step.name.toLowerCase().includes('company') && step.openAIResponse.includes('company')) {
          const response = step.openAIResponse;
          if (response.toLowerCase().includes('company:')) {
            const match = response.match(/company:\s*([^\n,]+)/i);
            if (match) knowledge.companyName = match[1].trim();
          }
        }
        if (step.name.toLowerCase().includes('industry') && step.openAIResponse.includes('industry')) {
          const response = step.openAIResponse;
          if (response.toLowerCase().includes('industry:')) {
            const match = response.match(/industry:\s*([^\n,]+)/i);
            if (match) knowledge.industry = match[1].trim();
          }
        }
        if (step.name.toLowerCase().includes('tone') && step.openAIResponse.includes('tone')) {
          const response = step.openAIResponse;
          if (response.toLowerCase().includes('tone:')) {
            const match = response.match(/tone:\s*([^\n,]+)/i);
            if (match) knowledge.preferredTone = match[1].trim();
          }
        }
      }
    }
    
    return knowledge;
  }
}

// Export singleton instance
export const ragContextEnhancer = new RAGContextEnhancer(); 