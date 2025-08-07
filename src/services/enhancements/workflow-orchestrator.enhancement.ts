import { ragService } from '../ragService';
import { Workflow, WorkflowStep } from '../../types/workflow';
import { EnhancedStepResponse, SmartDefaults } from './workflow-types.enhancement';
import { ragContextEnhancer } from './rag-context.enhancement';
import { securityEnhancer } from './security.enhancement';
import { openAIContextEnhancer } from './openai-context.enhancement';
import logger from '../../utils/logger';

/**
 * Workflow Orchestrator Enhancement Module
 * Main module that orchestrates all workflow enhancements
 * Import this into the original WorkflowService to get all enhanced functionality
 */

export class WorkflowOrchestrator {
  private ragEnhancer = ragContextEnhancer;
  private securityEnhancer = securityEnhancer;
  private openAIEnhancer = openAIContextEnhancer;
  private ragService = ragService;

  /**
   * Enhanced step processing with full RAG context and security
   * This is the main method to integrate into handleStepResponse
   */
  async processStepWithEnhancements(
    stepId: string,
    userInput: string,
    userId: string,
    orgId: string,
    originalHandleStepResponse: (stepId: string, userInput: string) => Promise<any>,
    getWorkflowFn: (workflowId: string) => Promise<Workflow | null>,
    getStepFn: (stepId: string) => Promise<WorkflowStep | null>,
    updateStepFn: (stepId: string, updates: any) => Promise<WorkflowStep>
  ): Promise<EnhancedStepResponse> {
    const startTime = Date.now();
    
    try {
      // Get current step and workflow
      const step = await getStepFn(stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found`);
      }
      
      const workflow = await getWorkflowFn(step.workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${step.workflowId} not found`);
      }
      
      const workflowType = this.getWorkflowTypeFromTemplate(workflow.templateId);
      
      // Get security configuration
      const securityContext = this.securityEnhancer.getWorkflowSecurity(workflowType);
      
      logger.info('Enhanced workflow processing', {
        stepId: stepId.substring(0, 8),
        stepName: step.name,
        workflowType,
        securityLevel: securityContext.securityLevel,
        userId: userId.substring(0, 8)
      });

      // Get RAG context for this step
      const ragContext = await this.ragEnhancer.getStepContext(
        userId,
        orgId,
        workflowType,
        step.name,
        userInput
      );

      // Enhanced system message with user context (if needed for custom OpenAI calls)
      const enhancedStep = this.ragEnhancer.enhanceStepWithContext(
        step, 
        ragContext.smartDefaults, 
        ragContext.relatedContent
      );

      // Process step with original method (enhanced step is available for custom OpenAI calls)
      const result = await originalHandleStepResponse(stepId, userInput);

      // Store interaction with security classification
      await this.securityEnhancer.storeSecureInteraction(
        userId,
        orgId,
        workflow,
        step,
        userInput,
        result.response || '',
        securityContext,
        startTime
      );

      // If workflow completed, extract and store user knowledge
      if (result.isComplete) {
        await this.handleWorkflowCompletionWithRAG(workflow, userId, orgId);
      }

      // Return enhanced response with all context layers
      return {
        ...result,
        ragContext: {
          smartDefaults: ragContext.smartDefaults,
          relatedContent: ragContext.relatedContent,
          suggestions: ragContext.suggestions
        },
        securityLevel: securityContext.securityLevel,
        contextLayers: {
          userProfile: ragContext.userProfile,
          workflowContext: {
            workflowType,
            templateId: workflow.templateId,
            currentStep: step.name
          },
          conversationHistory: ragContext.relatedContent,
          securityTags: securityContext.securityTags
        }
      };
    } catch (error) {
      logger.error('Enhanced workflow processing error', { error, stepId, userId });
      // Fallback to original processing
      const fallbackResult = await originalHandleStepResponse(stepId, userInput);
      return { 
        ...fallbackResult, 
        ragContext: {},
        securityLevel: 'internal',
        contextLayers: { securityTags: ['fallback'] }
      };
    }
  }

  /**
   * Enhanced workflow initialization with smart defaults
   * Use this in createWorkflow to add smart defaults to the first step
   */
  async initializeWorkflowWithContext(
    workflow: Workflow,
    userId: string,
    orgId: string,
    updateStepFn: (stepId: string, updates: any) => Promise<WorkflowStep>
  ): Promise<void> {
    try {
      const workflowType = this.getWorkflowTypeFromTemplate(workflow.templateId);
      
      // Get smart defaults for this user and workflow type
      const smartDefaults = await this.ragEnhancer.getSmartDefaults(userId, orgId, workflowType);
      
      logger.info('Initializing workflow with smart defaults', {
        workflowType,
        hasDefaults: Object.keys(smartDefaults).length > 0,
        userId: userId.substring(0, 8)
      });
      
      // Enhance first step with smart defaults if available
      if (workflow.steps.length > 0 && (smartDefaults.companyName || smartDefaults.suggestedContent)) {
        const firstStep = workflow.steps[0];
        await this.ragEnhancer.enhanceFirstStepWithDefaults(firstStep, smartDefaults, updateStepFn);
      }
    } catch (error) {
      logger.error('Smart workflow initialization error', { error, workflowId: workflow.id, userId });
    }
  }

  /**
   * Get enhanced system message for OpenAI calls
   * Use this to replace the standard system message construction
   */
  getEnhancedSystemMessage(
    step: WorkflowStep,
    userId: string,
    orgId: string,
    workflowType: string,
    previousResponses: any[] = []
  ): string {
    // This would typically get context from RAG and security services
    // For now, return a basic enhanced message that can be expanded
    const contextLayers = {
      userProfile: {
        // This would come from getUserKnowledge
        companyName: 'Honeyjar',
        industry: 'PR Tech',
        preferredTone: 'technical'
      },
      workflowContext: {
        workflowType,
        currentStep: step.name
      },
      securityTags: this.securityEnhancer.getWorkflowSecurity(workflowType).securityTags,
      securityGuidelines: this.securityEnhancer.getSecurityGuidelines(workflowType)
    };

    return this.openAIEnhancer.constructEnhancedSystemMessage(
      step,
      contextLayers,
      previousResponses
    );
  }

  /**
   * Create contextual message with security levels
   * Use this when adding messages to threads
   */
  createContextualMessage(
    content: string,
    role: 'user' | 'assistant' | 'system',
    workflowType: string,
    additionalContext?: any
  ) {
    const securityContext = this.securityEnhancer.getWorkflowSecurity(workflowType);
    return this.securityEnhancer.createSecureMessage(
      content,
      role,
      securityContext,
      additionalContext
    );
  }

  /**
   * Get workflow suggestions based on user history
   */
  async getWorkflowSuggestions(userId: string, orgId: string): Promise<{
    recommendedWorkflows: string[];
    recentTopics: string[];
    smartDefaults: SmartDefaults;
  }> {
    try {
      const userKnowledge = await this.ragService.getUserKnowledge(userId, orgId);
      
      if (!userKnowledge) {
        return {
          recommendedWorkflows: ['Press Release', 'Social Post'],
          recentTopics: [],
          smartDefaults: {}
        };
      }

      return {
        recommendedWorkflows: userKnowledge.preferredWorkflows || ['Press Release', 'Social Post'],
        recentTopics: [], // Could be populated from recent search results
        smartDefaults: {
          companyName: userKnowledge.companyName,
          industry: userKnowledge.industry,
          preferredTone: userKnowledge.preferredTone
        }
      };
    } catch (error) {
      logger.error('Error getting workflow suggestions', { error, userId });
      return {
        recommendedWorkflows: ['Press Release', 'Social Post'],
        recentTopics: [],
        smartDefaults: {}
      };
    }
  }

  /**
   * Update user knowledge based on workflow interaction
   */
  async updateUserKnowledge(
    userId: string,
    orgId: string,
    knowledge: Partial<{
      companyName?: string;
      industry?: string;
      preferredTone?: string;
      jobTitle?: string;
    }>
  ): Promise<void> {
    try {
      const existingKnowledge = await this.ragService.getUserKnowledge(userId, orgId);
      
      const updatedKnowledge = {
        userId,
        orgId,
        ...existingKnowledge,
        ...knowledge
      };
      
      await this.ragService.storeUserKnowledge(updatedKnowledge);
      logger.info(`Updated user knowledge for ${userId.substring(0, 8)}`);
    } catch (error) {
      logger.error('Error updating user knowledge', { error, userId: userId.substring(0, 8) });
      throw error;
    }
  }

  /**
   * Handle workflow completion with RAG knowledge extraction
   */
  private async handleWorkflowCompletionWithRAG(
    workflow: Workflow,
    userId: string,
    orgId: string
  ): Promise<void> {
    try {
      const workflowType = this.getWorkflowTypeFromTemplate(workflow.templateId);
      
      // Extract knowledge from completed workflow
      const workflowData = this.ragEnhancer.extractWorkflowKnowledge(workflow);
      
      // Update user knowledge based on workflow completion
      if (workflowData.companyName || workflowData.industry || workflowData.preferredTone) {
        await this.updateUserKnowledge(userId, orgId, workflowData);
      }
      
      logger.info(`Updated user knowledge from completed workflow`, {
        userId: userId.substring(0, 8),
        workflowType,
        hasCompanyData: !!workflowData.companyName
      });
    } catch (error) {
      logger.error('Error handling workflow completion with RAG', { error, workflowId: workflow.id });
    }
  }

  /**
   * Map template IDs to workflow types
   */
  private getWorkflowTypeFromTemplate(templateId: string): string {
    // These UUIDs should match the ones in your workflow service
    const templateMap: Record<string, string> = {
      '550e8400-e29b-41d4-a716-446655440000': 'Base Workflow',
      '550e8400-e29b-41d4-a716-446655440007': 'Press Release',
      '550e8400-e29b-41d4-a716-446655440008': 'Media Pitch',
      '550e8400-e29b-41d4-a716-446655440009': 'Social Post',
      '550e8400-e29b-41d4-a716-446655440010': 'Blog Article',
      '550e8400-e29b-41d4-a716-446655440011': 'FAQ',
      '550e8400-e29b-41d4-a716-446655440006': 'Media List Generator',
      '550e8400-e29b-41d4-a716-446655440012': 'Media Matching',
      '550e8400-e29b-41d4-a716-446655440003': 'JSON Dialog PR Workflow',
      '550e8400-e29b-41d4-a716-446655440004': 'Test Step Transitions',
      '550e8400-e29b-41d4-a716-446655440001': 'Dummy Workflow'
    };
    
    return templateMap[templateId] || 'Unknown Workflow';
  }

  /**
   * Check if user has required context for workflow
   */
  async hasRequiredContext(userId: string, orgId: string, workflowType: string): Promise<{
    hasContext: boolean;
    missingFields: string[];
    recommendations: string[];
  }> {
    try {
      const userKnowledge = await this.ragService.getUserKnowledge(userId, orgId);
      const missingFields: string[] = [];
      const recommendations: string[] = [];

      if (!userKnowledge?.companyName) {
        missingFields.push('companyName');
        recommendations.push('Add your company name for better personalization');
      }
      if (!userKnowledge?.industry) {
        missingFields.push('industry');
        recommendations.push('Specify your industry for targeted content');
      }
      if (!userKnowledge?.preferredTone) {
        missingFields.push('preferredTone');
        recommendations.push('Set your preferred communication tone');
      }

      return {
        hasContext: missingFields.length === 0,
        missingFields,
        recommendations
      };
    } catch (error) {
      logger.error('Error checking required context', { error, userId });
      return {
        hasContext: false,
        missingFields: ['companyName', 'industry', 'preferredTone'],
        recommendations: ['Complete your user profile for better workflow experience']
      };
    }
  }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator(); 