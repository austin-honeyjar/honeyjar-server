import { WorkflowService } from './workflow.service';
import { ragService, RAGService, UserKnowledge, ConversationContext } from './ragService';
import { WorkflowSecurityService } from './workflowSecurityService';
import logger from '../utils/logger';
import { Workflow, WorkflowStep } from '../types/workflow';

export interface EnhancedStepResponse {
  response?: string;
  isComplete: boolean;
  nextStep?: WorkflowStep;
  nextPrompt?: string;
  ragContext?: {
    smartDefaults?: any;
    relatedContent?: any[];
    suggestions?: string[];
  };
}

export class EnhancedWorkflowService extends WorkflowService {
  private ragService: RAGService;
  private securityService: WorkflowSecurityService;

  constructor() {
    super();
    this.ragService = ragService;
    this.securityService = new WorkflowSecurityService();
  }

  /**
   * Enhanced step processing with RAG context
   */
  async handleStepResponseWithRAG(
    stepId: string, 
    userInput: string, 
    userId: string, 
    orgId: string = ''
  ): Promise<EnhancedStepResponse> {
    const startTime = Date.now();
    
    try {
      // Get current step and workflow using inherited dbService
      const step = await (this as any).dbService.getStep(stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found`);
      }
      
      const workflow = await this.getWorkflow(step.workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${step.workflowId} not found`);
      }
      
      const workflowType = this.getWorkflowTypeFromTemplate(workflow.templateId);
      
      // Get security configuration
      const securityConfig = this.securityService.getWorkflowSecurity(workflowType);
      
      logger.info('Enhanced workflow processing', {
        stepId: stepId.substring(0, 8),
        stepName: step.name,
        workflowType,
        securityLevel: securityConfig.securityLevel,
        userId: userId.substring(0, 8)
      });

      // Get relevant context for this step
      const ragContext = await this.ragService.getRelevantContext(
        userId,
        orgId,
        workflowType,
        step.name,
        userInput
      );

      // Enhanced system message with user context
      const enhancedStep = this.enhanceStepWithContext(step, ragContext.userDefaults, ragContext.relatedConversations);

      // Process step with enhanced context (we'll use the original step ID)
      const result = await super.handleStepResponse(stepId, userInput);

      // Store interaction for learning
      await this.storeInteractionData(
        userId, 
        orgId, 
        workflow, 
        step, 
        userInput, 
        result.response || '', 
        startTime
      );

      // If workflow completed, update user knowledge
      if (result.isComplete) {
        await this.handleWorkflowCompletionRAG(workflow, userId, orgId);
      }

      // Return enhanced response with RAG context
      return {
        ...result,
        ragContext: {
          smartDefaults: ragContext.userDefaults,
          relatedContent: [...ragContext.relatedConversations, ...ragContext.similarAssets],
          suggestions: this.generateStepSuggestions(ragContext)
        }
      };
    } catch (error) {
      logger.error('Enhanced workflow processing error', { error, stepId, userId });
      // Fallback to original processing
      const fallbackResult = await super.handleStepResponse(stepId, userInput);
      return { ...fallbackResult, ragContext: {} };
    }
  }

  /**
   * Smart workflow initialization with user context
   */
  async initializeWorkflowWithContext(
    threadId: string, 
    templateId: string, 
    userId: string, 
    orgId: string = ''
  ): Promise<Workflow> {
    try {
      const workflowType = this.getWorkflowTypeFromTemplate(templateId);
      
      // Get smart defaults from user history
      const smartDefaults = await this.ragService.getSmartDefaults(userId, orgId, workflowType);
      
      logger.info('Initializing workflow with smart defaults', {
        workflowType,
        hasDefaults: Object.keys(smartDefaults).length > 0,
        userId: userId.substring(0, 8)
      });
      
      // Create workflow normally first
      const workflow = await super.createWorkflow(threadId, templateId);
      
      // Enhance first step with smart defaults if available
      if (workflow.steps.length > 0 && (smartDefaults.companyName || smartDefaults.suggestedContent)) {
        const firstStep = workflow.steps[0];
        await this.enhanceFirstStepWithDefaults(firstStep, smartDefaults);
      }

      return workflow;
    } catch (error) {
      logger.error('Smart workflow initialization error', { error, templateId, userId });
      // Fallback to normal creation
      return await super.createWorkflow(threadId, templateId);
    }
  }

  /**
   * Get workflow suggestions based on user history
   */
  async getWorkflowSuggestions(userId: string, orgId: string): Promise<{
    recommendedWorkflows: string[];
    recentTopics: string[];
    smartDefaults: any;
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
   * Search user's content for context
   */
  async searchUserContent(
    userId: string,
    orgId: string,
    query: string,
    options: {
      workflowTypes?: string[];
      limit?: number;
    } = {}
  ) {
    try {
      return await this.ragService.searchUserContent(userId, orgId, query, {
        contentTypes: ['conversation', 'asset'],
        workflowTypes: options.workflowTypes,
        limit: options.limit || 10,
        minRelevanceScore: 0.7
      });
    } catch (error) {
      logger.error('Error searching user content', { error, userId, query });
      return [];
    }
  }

  /**
   * Update user knowledge manually
   */
  async updateUserKnowledge(userId: string, orgId: string, knowledge: Partial<UserKnowledge>): Promise<void> {
    try {
      const existingKnowledge = await this.ragService.getUserKnowledge(userId, orgId);
      
      const updatedKnowledge: UserKnowledge = {
        userId,
        orgId,
        ...existingKnowledge,
        ...knowledge
      };
      
      await this.ragService.storeUserKnowledge(updatedKnowledge);
      logger.info(`Updated user knowledge for ${userId}`);
    } catch (error) {
      logger.error('Error updating user knowledge', { error, userId });
      throw error;
    }
  }

  // MARK: - Private Helper Methods

  private enhanceStepWithContext(
    step: WorkflowStep, 
    smartDefaults: any, 
    relatedConversations: any[]
  ): WorkflowStep {
    let enhancedPrompt = step.prompt;

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

  private async enhanceFirstStepWithDefaults(step: WorkflowStep, smartDefaults: any): Promise<void> {
    try {
      // Build contextual prompt
      let enhancedPrompt = step.prompt;

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
      await this.updateStep(step.id, {
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

  private async storeInteractionData(
    userId: string,
    orgId: string,
    workflow: Workflow,
    step: WorkflowStep,
    userInput: string,
    aiResponse: string,
    startTime: number
  ): Promise<void> {
    try {
      const workflowType = this.getWorkflowTypeFromTemplate(workflow.templateId);
      const securityConfig = this.securityService.getWorkflowSecurity(workflowType);
      
      // Determine security level based on workflow security and content
      let securityLevel: 'public' | 'internal' | 'confidential' | 'restricted' = 'internal';
      let securityTags: string[] = [];
      
      // Map workflow security level to conversation security level
      switch (securityConfig.securityLevel) {
        case 'open':
          securityLevel = 'internal';
          break;
        case 'restricted':
          securityLevel = 'confidential';
          break;
        case 'locked':
          securityLevel = 'restricted';
          securityTags.push('workflow_locked');
          break;
        default:
          securityLevel = 'internal';
      }
      
      // Add security tags based on workflow data restrictions
      if (securityConfig.dataTransferRestrictions.includes('contact_info')) {
        securityTags.push('contact_info');
      }
      if (securityConfig.dataTransferRestrictions.includes('personal_info')) {
        securityTags.push('pii');
      }
      if (securityConfig.dataTransferRestrictions.includes('financial_data')) {
        securityTags.push('financial');
      }
      
      // Check for sensitive content in user input
      const contentToAnalyze = `${userInput} ${aiResponse}`;
      const hasPII = /\b\d{3}-\d{2}-\d{4}\b|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b|\b\d{3}-\d{3}-\d{4}\b/.test(contentToAnalyze);
      if (hasPII) {
        securityTags.push('pii');
        securityLevel = 'confidential';
      }

      const context: ConversationContext = {
        threadId: workflow.threadId,
        workflowId: workflow.id,
        workflowType,
        stepName: step.name,
        intent: this.extractIntent(userInput, step.name),
        outcome: workflow.status === 'completed' ? 'completed' : undefined,
        securityLevel,
        securityTags
      };

      // Store conversation embedding with security classification
      await this.ragService.storeConversation(
        userId,
        orgId,
        context,
        `${step.name}: ${userInput}\nResponse: ${aiResponse}`,
        `User interaction in ${step.name} step`,
        {
          stepType: step.stepType,
          responseTime: Date.now() - startTime,
          inputLength: userInput.length,
          responseLength: aiResponse.length,
          workflowSecurityLevel: securityConfig.securityLevel,
          aiSwitchingEnabled: securityConfig.aiSwitchingEnabled
        }
      );

      logger.debug(`Stored secure interaction data for step ${step.id} with security level: ${securityLevel}`);
    } catch (error) {
      logger.error('Error storing interaction data', { error, stepId: step.id });
    }
  }

  private async handleWorkflowCompletionRAG(workflow: Workflow, userId: string, orgId: string): Promise<void> {
    try {
      // Extract collected data from workflow
      const collectedData = this.extractCollectedData(workflow);
      const workflowType = this.getWorkflowTypeFromTemplate(workflow.templateId);

      // Update user knowledge from workflow completion
      await this.ragService.updateKnowledgeFromWorkflow(userId, orgId, {
        workflowType,
        collectedData,
        userSatisfaction: 5, // Assume satisfied if completed
        completed: true
      });

      // Store asset if generated
      const assetStep = workflow.steps.find(s => s.name.includes('Asset Generation') || s.name.includes('Generate'));
      if (assetStep && assetStep.metadata?.generatedAsset) {
        await this.ragService.storeAssetHistory(
          userId,
          orgId,
          workflow.threadId,
          workflow.id,
          {
            assetType: workflowType,
            originalContent: assetStep.metadata.generatedAsset,
            approved: true, // Assume approved if workflow completed
            successfulPatterns: { completedWorkflow: true },
          }
        );
      }

      logger.info(`Processed workflow completion for ${userId}, type: ${workflowType}`);
    } catch (error) {
      logger.error('Error handling workflow completion', { error, workflowId: workflow.id });
    }
  }

  private extractCollectedData(workflow: Workflow): Record<string, any> {
    const collectedData: Record<string, any> = {};
    
    workflow.steps.forEach(step => {
      if (step.metadata?.collectedInformation) {
        Object.assign(collectedData, step.metadata.collectedInformation);
      }
      
      // Also extract from step responses
      if (step.metadata?.userResponse) {
        collectedData[step.name] = step.metadata.userResponse;
      }
    });
    
    return collectedData;
  }

  private extractIntent(userInput: string, stepName: string): string {
    // Simple intent extraction based on keywords and step context
    const input = userInput.toLowerCase();
    
    if (input.includes('company') || input.includes('business')) return 'company_info';
    if (input.includes('product') || input.includes('service')) return 'product_info';
    if (input.includes('launch') || input.includes('announce')) return 'announcement';
    if (input.includes('revise') || input.includes('change')) return 'revision';
    if (input.includes('approve') || input.includes('looks good')) return 'approval';
    
    return stepName.toLowerCase().replace(/\s+/g, '_');
  }

  private generateStepSuggestions(ragContext: any): string[] {
    const suggestions: string[] = [];
    
    if (ragContext.userDefaults?.companyName) {
      suggestions.push(`Use "${ragContext.userDefaults.companyName}" as company name`);
    }
    
    if (ragContext.userDefaults?.preferredTone) {
      suggestions.push(`Apply ${ragContext.userDefaults.preferredTone} tone`);
    }
    
    if (ragContext.relatedConversations?.length > 0) {
      suggestions.push(`Reference similar past work`);
    }
    
    return suggestions;
  }

  private getWorkflowTypeFromTemplate(templateId: string): string {
    // Map template IDs to workflow types
    const mapping: Record<string, string> = {
      '00000000-0000-0000-0000-000000000008': 'Press Release',
      '00000000-0000-0000-0000-000000000009': 'Media Pitch', 
      '00000000-0000-0000-0000-000000000010': 'Social Post',
      '00000000-0000-0000-0000-000000000011': 'Blog Article',
      '00000000-0000-0000-0000-000000000012': 'FAQ',
      '00000000-0000-0000-0000-000000000013': 'Media List',
      '00000000-0000-0000-0000-000000000014': 'Quick Press Release'
    };
    
    return mapping[templateId] || 'General Workflow';
  }
}

export const enhancedWorkflowService = new EnhancedWorkflowService(); 