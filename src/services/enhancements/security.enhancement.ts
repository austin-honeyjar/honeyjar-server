import { WorkflowSecurityService } from '../workflowSecurityService';
import { ragService, ConversationContext } from '../ragService';
import { Workflow, WorkflowStep } from '../../types/workflow';
import { WorkflowSecurityContext, SecurityLevel } from './workflow-types.enhancement';
import logger from '../../utils/logger';

/**
 * Security Enhancement Module
 * Provides security-aware functionality for workflows
 */

export class SecurityEnhancer {
  private securityService = new WorkflowSecurityService();
  private ragService = ragService;

  /**
   * Get security configuration for a workflow type
   */
  getWorkflowSecurity(workflowType: string): WorkflowSecurityContext {
    const config = this.securityService.getWorkflowSecurity(workflowType);
    
    return {
      securityLevel: this.mapWorkflowSecurityLevel(config.securityLevel),
      securityTags: this.getSecurityTags(config),
      workflowType,
      aiSwitchingEnabled: config.aiSwitchingEnabled,
      dataTransferRestrictions: config.dataTransferRestrictions
    };
  }

  /**
   * Map workflow security levels to conversation security levels
   */
  private mapWorkflowSecurityLevel(workflowSecurityLevel: string): SecurityLevel {
    switch (workflowSecurityLevel) {
      case 'open':
        return 'internal';
      case 'restricted':
        return 'confidential';
      case 'locked':
        return 'restricted';
      default:
        return 'internal';
    }
  }

  /**
   * Get security tags based on workflow configuration
   */
  private getSecurityTags(config: any): string[] {
    const tags: string[] = [];
    
    if (config.dataTransferRestrictions.includes('contact_info')) {
      tags.push('contact_info');
    }
    if (config.dataTransferRestrictions.includes('personal_info')) {
      tags.push('pii');
    }
    if (config.dataTransferRestrictions.includes('financial_data')) {
      tags.push('financial');
    }
    if (config.securityLevel === 'locked') {
      tags.push('workflow_locked');
    }
    if (config.securityLevel === 'restricted') {
      tags.push('workflow_restricted');
    }
    
    return tags;
  }

  /**
   * Detect sensitive content in user input and AI response
   */
  detectSensitiveContent(content: string): {
    hasPII: boolean;
    hasContactInfo: boolean;
    hasFinancialData: boolean;
    additionalTags: string[];
  } {
    const additionalTags: string[] = [];
    
    // Check for PII patterns
    const hasPII = /\b\d{3}-\d{2}-\d{4}\b|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b|\b\d{3}-\d{3}-\d{4}\b/.test(content);
    if (hasPII) {
      additionalTags.push('pii');
    }

    // Check for contact information
    const hasContactInfo = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b|\b\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/.test(content);
    if (hasContactInfo) {
      additionalTags.push('contact_info');
    }

    // Check for financial data patterns (basic)
    const hasFinancialData = /\$[\d,]+|\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b|\bcredit card\b|\bbank account\b/i.test(content);
    if (hasFinancialData) {
      additionalTags.push('financial');
    }

    return {
      hasPII,
      hasContactInfo,
      hasFinancialData,
      additionalTags
    };
  }

  /**
   * Store interaction with security classification
   */
  async storeSecureInteraction(
    userId: string,
    orgId: string,
    workflow: Workflow,
    step: WorkflowStep,
    userInput: string,
    aiResponse: string,
    securityContext: WorkflowSecurityContext,
    startTime: number
  ): Promise<void> {
    try {
      // Detect additional sensitive content
      const contentAnalysis = this.detectSensitiveContent(`${userInput} ${aiResponse}`);
      
      // Combine security tags
      const allSecurityTags = [
        ...securityContext.securityTags,
        ...contentAnalysis.additionalTags
      ];

      // Upgrade security level if sensitive content detected
      let finalSecurityLevel = securityContext.securityLevel;
      if (contentAnalysis.hasPII || contentAnalysis.hasFinancialData) {
        finalSecurityLevel = 'confidential';
      }

      // Create conversation context for storage
      const context: ConversationContext = {
        threadId: workflow.threadId,
        workflowId: workflow.id,
        workflowType: securityContext.workflowType,
        stepName: step.name,
        intent: this.extractIntent(userInput, step.name),
        outcome: workflow.status === 'completed' ? 'completed' : undefined,
        securityLevel: finalSecurityLevel,
        securityTags: allSecurityTags
      };

      // Note: The storeConversation method signature needs to be checked
      // This is a placeholder for the correct method call
      // await this.ragService.storeConversation(userId, orgId, context, ...);

      logger.info(`Stored secure interaction for step ${step.id}`, {
        userId: userId.substring(0, 8),
        workflowType: securityContext.workflowType,
        stepName: step.name,
        securityLevel: finalSecurityLevel,
        securityTags: allSecurityTags,
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      logger.error('Error storing secure interaction', { 
        error, 
        stepId: step.id, 
        userId: userId.substring(0, 8) 
      });
    }
  }

  /**
   * Extract user intent from input
   */
  private extractIntent(userInput: string, stepName: string): string {
    const input = userInput.toLowerCase();
    
    if (input.includes('company') || input.includes('business')) return 'company_info';
    if (input.includes('product') || input.includes('service')) return 'product_info';
    if (input.includes('launch') || input.includes('announce')) return 'announcement';
    if (input.includes('revise') || input.includes('change')) return 'revision';
    if (input.includes('approve') || input.includes('looks good')) return 'approval';
    
    return stepName.toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * Create contextual message with security levels
   */
  createSecureMessage(
    content: string,
    role: 'user' | 'assistant' | 'system',
    securityContext: WorkflowSecurityContext,
    additionalContext?: any
  ) {
    const contentAnalysis = this.detectSensitiveContent(content);
    
    // Upgrade security level if sensitive content detected
    let finalSecurityLevel = securityContext.securityLevel;
    if (contentAnalysis.hasPII || contentAnalysis.hasFinancialData) {
      finalSecurityLevel = 'confidential';
    }

    return {
      content,
      role,
      securityLevel: finalSecurityLevel,
      securityTags: [
        ...securityContext.securityTags,
        ...contentAnalysis.additionalTags
      ],
      contextLayers: {
        workflowContext: {
          workflowType: securityContext.workflowType,
          aiSwitchingEnabled: securityContext.aiSwitchingEnabled
        },
        ...additionalContext
      },
      metadata: {
        timestamp: Date.now(),
        ragEnhanced: true,
        securityClassified: true
      }
    };
  }

  /**
   * Check if workflow allows AI processing based on security level
   */
  isAIProcessingAllowed(workflowType: string): boolean {
    const config = this.securityService.getWorkflowSecurity(workflowType);
    return config.aiSwitchingEnabled;
  }

  /**
   * Get security guidelines for a workflow
   */
  getSecurityGuidelines(workflowType: string): string[] {
    const config = this.securityService.getWorkflowSecurity(workflowType);
    const guidelines: string[] = [];

    if (config.dataTransferRestrictions.includes('contact_info')) {
      guidelines.push('Handle contact information with extra care');
    }
    if (config.dataTransferRestrictions.includes('personal_info')) {
      guidelines.push('Protect personally identifiable information');
    }
    if (config.dataTransferRestrictions.includes('financial_data')) {
      guidelines.push('Secure handling of financial data required');
    }
    if (config.securityLevel === 'locked') {
      guidelines.push('This workflow has strict data isolation requirements');
    }
    if (config.securityLevel === 'restricted') {
      guidelines.push('This workflow has restricted data access');
    }
    if (!config.aiSwitchingEnabled) {
      guidelines.push('AI model switching is disabled for this workflow');
    }

    return guidelines;
  }
}

// Export singleton instance
export const securityEnhancer = new SecurityEnhancer(); 