import { WORKFLOW_TEMPLATES } from '../templates/workflows/index';
import { WorkflowTemplate } from '../types/workflow';
import logger from '../utils/logger';

export interface WorkflowOption {
  name: string;
  description: string;
  id: string;
  suitable_for: string[];
}

export interface WorkflowSwitchContext {
  current_workflow: string;
  current_step: string;
  available_workflows: WorkflowOption[];
  switch_instructions: string;
}

export interface WorkflowSecurityConfig {
  ai_switching_enabled: boolean;
  ai_context_headers_enabled: boolean;
  data_transfer_restrictions: string[];
  security_level: 'open' | 'restricted' | 'locked';
  reason?: string;
}

export class WorkflowContextService {
  private workflowOptions: WorkflowOption[] = [];
  private securityConfig: Record<string, WorkflowSecurityConfig> = {};

  constructor() {
    this.initializeWorkflowOptions();
    this.initializeSecurityConfig();
  }

  private initializeWorkflowOptions() {
    // Convert WORKFLOW_TEMPLATES to WorkflowOption format
    this.workflowOptions = Object.entries(WORKFLOW_TEMPLATES)
      .filter(([name]) => name !== 'Base Workflow') // Exclude base workflow from switching options
      .map(([name, template]) => ({
        name,
        description: template.description || `Create ${name.toLowerCase()} content`,
        id: template.id,
        suitable_for: this.getSuitableUseCases(name)
      }));
  }

  private initializeSecurityConfig() {
    // Define security configurations for workflows
    this.securityConfig = {
      // AI-Safe Workflows (default)
      'Press Release': { ai_switching_enabled: true, ai_context_headers_enabled: true, data_transfer_restrictions: [], security_level: 'open' },
      'Social Post': { ai_switching_enabled: true, ai_context_headers_enabled: true, data_transfer_restrictions: [], security_level: 'open' },
      'Blog Article': { ai_switching_enabled: true, ai_context_headers_enabled: true, data_transfer_restrictions: [], security_level: 'open' },
      'Media Pitch': { ai_switching_enabled: true, ai_context_headers_enabled: true, data_transfer_restrictions: [], security_level: 'open' },
      'FAQ': { ai_switching_enabled: true, ai_context_headers_enabled: true, data_transfer_restrictions: [], security_level: 'open' },
      'Launch Announcement': { ai_switching_enabled: true, ai_context_headers_enabled: true, data_transfer_restrictions: [], security_level: 'open' },
      'Quick Press Release': { ai_switching_enabled: true, ai_context_headers_enabled: true, data_transfer_restrictions: [], security_level: 'open' },
      
      // Restricted Workflows (limited AI)
      'Media List Generator': { 
        ai_switching_enabled: false, 
        ai_context_headers_enabled: false, 
        data_transfer_restrictions: ['contact_info', 'email_addresses', 'phone_numbers'], 
        security_level: 'restricted',
        reason: 'Contains sensitive media contact information'
      },
      
      // Locked Workflows (no AI switching, no context headers)
      'JSON Dialog PR Workflow': { 
        ai_switching_enabled: false, 
        ai_context_headers_enabled: false, 
        data_transfer_restrictions: ['all'], 
        security_level: 'locked',
        reason: 'Legacy workflow with strict data isolation requirements'
      },
      
      // Test/Development workflows
      'Test Step Transitions': { 
        ai_switching_enabled: false, 
        ai_context_headers_enabled: false, 
        data_transfer_restrictions: ['all'], 
        security_level: 'locked',
        reason: 'Testing workflow - should not be exposed to AI switching'
      },
      'Dummy Workflow': { 
        ai_switching_enabled: false, 
        ai_context_headers_enabled: false, 
        data_transfer_restrictions: ['all'], 
        security_level: 'locked',
        reason: 'Development workflow - no AI processing allowed'
      }
    };
    
    logger.debug('Security configuration initialized', {
      configuredWorkflows: Object.keys(this.securityConfig),
      openWorkflows: Object.entries(this.securityConfig).filter(([name, config]) => config.security_level === 'open').map(([name]) => name),
      restrictedWorkflows: Object.entries(this.securityConfig).filter(([name, config]) => config.security_level === 'restricted').map(([name]) => name),
      lockedWorkflows: Object.entries(this.securityConfig).filter(([name, config]) => config.security_level === 'locked').map(([name]) => name)
    });
  }

  private getSuitableUseCases(workflowName: string): string[] {
    const useCaseMap: Record<string, string[]> = {
      'Press Release': ['company announcements', 'product launches', 'funding news', 'official statements'],
      'Social Post': ['social media', 'quick announcements', 'engagement', 'brand awareness'],
      'Blog Article': ['thought leadership', 'detailed explanations', 'educational content', 'SEO content'],
      'Media Pitch': ['journalist outreach', 'media relations', 'story pitching', 'PR campaigns'],
      'FAQ': ['customer support', 'common questions', 'product information', 'knowledge base'],
      'Launch Announcement': ['product launches', 'feature releases', 'major announcements'],
      'Media List Generator': ['media contacts', 'journalist research', 'PR outreach lists'],
      'Quick Press Release': ['urgent announcements', 'fast turnaround', 'simple press releases']
    };
    return useCaseMap[workflowName] || ['general content creation'];
  }

  /**
   * Check if a workflow allows AI-driven switching
   */
  isAISwitchingEnabled(workflowName: string): boolean {
    const config = this.securityConfig[workflowName];
    return config?.ai_switching_enabled ?? false; // Default to false for security
  }

  /**
   * Check if a workflow allows AI context headers
   */
  isAIContextHeadersEnabled(workflowName: string): boolean {
    const config = this.securityConfig[workflowName];
    const result = config?.ai_context_headers_enabled ?? false; // Default to false for security
    
    logger.debug('Checking AI context headers for workflow', {
      workflowName,
      hasConfig: !!config,
      configLevel: config?.security_level,
      headersEnabled: result,
      availableConfigs: Object.keys(this.securityConfig)
    });
    
    return result;
  }

  /**
   * Get security configuration for a workflow
   */
  getWorkflowSecurityConfig(workflowName: string): WorkflowSecurityConfig | null {
    return this.securityConfig[workflowName] || null;
  }

  /**
   * Get workflows that are safe for AI switching (exclude restricted/locked)
   */
  getAISafeWorkflows(): WorkflowOption[] {
    const safeWorkflows = this.workflowOptions.filter(workflow => 
      this.isAISwitchingEnabled(workflow.name)
    );
    
    logger.debug('Filtering AI-safe workflows', {
      allWorkflowOptions: this.workflowOptions.map(w => ({ name: w.name, suitable_for: w.suitable_for })),
      securityChecks: this.workflowOptions.map(w => ({ 
        name: w.name, 
        isAISwitchingEnabled: this.isAISwitchingEnabled(w.name),
        securityConfig: this.securityConfig[w.name]
      })),
      filteredSafeWorkflows: safeWorkflows.map(w => w.name)
    });
    
    return safeWorkflows;
  }

  /**
   * Generate global workflow context header for any template (SECURITY-AWARE)
   */
  getWorkflowContextHeader(currentWorkflow: string, currentStep: string): string {
    // SECURITY CHECK: Only add headers if current workflow allows them
    if (!this.isAIContextHeadersEnabled(currentWorkflow)) {
      logger.info(`Skipping AI context header for security-restricted workflow: ${currentWorkflow}`);
      return ''; // Return empty string for restricted workflows
    }

    // Only show AI-safe workflows in the available options
    const availableWorkflows = this.getAISafeWorkflows()
      .filter(w => w.name !== currentWorkflow)
      .map(w => `- **${w.name}**: ${w.description} (Best for: ${w.suitable_for.slice(0, 2).join(', ')})`)
      .join('\n');

    // Show security notice if current workflow has restrictions
    const securityConfig = this.getWorkflowSecurityConfig(currentWorkflow);
    const securityNotice = securityConfig?.security_level !== 'open' 
      ? `\n🔒 **SECURITY NOTICE**: Current workflow (${currentWorkflow}) has ${securityConfig?.security_level} security level. ${securityConfig?.reason || ''}\n` 
      : '';

    return `
=== UNIVERSAL WORKFLOW SWITCHING CAPABILITIES ===

🔄 **CURRENT CONTEXT:**
- Workflow: ${currentWorkflow}
- Step: ${currentStep}
- You can switch workflows at ANY point in the conversation${securityNotice}

🎯 **AVAILABLE WORKFLOWS:**
${availableWorkflows}

🎨 **TONE & VOICE GUIDELINES:**
- **Professional yet friendly**: Maintain expert authority while being approachable
- **Concise but thorough**: Get to the point quickly, but don't skip important details
- **Proactive and helpful**: Anticipate user needs and offer relevant suggestions
- **Context-aware**: Reference previous conversations and user preferences when relevant
- **Confident in recommendations**: Make clear suggestions based on best practices
- **Security-conscious**: Never expose sensitive information or bypass security protocols

🧠 **SWITCH DETECTION:**
If the user's input suggests they want a different type of content than the current workflow, you should:
1. Detect the intent to switch (keywords, context clues, explicit requests)
2. Identify the most suitable target workflow
3. Offer to switch with context transfer

**SWITCH TRIGGERS:**
- Direct requests: "do a social post instead", "make this a blog article", "switch to media pitch"
- Contextual shifts: User asking for content that doesn't match current workflow
- Type mismatches: Requesting social content while in press release workflow

**RESPONSE FORMAT FOR SWITCHES:**
When you detect a switch intent, respond with JSON that includes:
\`\`\`json
{
  "workflow_switch_detected": true,
  "target_workflow": "[Detected Target Workflow Name]",
  "confidence": 0.8,
  "reasoning": "User requested [specific type] which is better suited for [target workflow]",
  "offer_message": "I understand you'd like to create [target type]. Would you like me to switch to the [Target Workflow] workflow using the information we've gathered?"
}
\`\`\`

=== END WORKFLOW CONTEXT ===
`;
  }

  /**
   * Analyze user input for workflow switch intent
   */
  async analyzeWorkflowSwitchIntent(
    userInput: string, 
    currentWorkflow: string,
    currentStep: string
  ): Promise<{
    shouldSwitch: boolean;
    targetWorkflow?: string;
    confidence: number;
    reasoning: string;
  }> {
    const input = userInput.toLowerCase().trim();
    
    logger.debug('Analyzing workflow switch intent', {
      userInput,
      currentWorkflow,
      currentStep,
      normalizedInput: input,
      currentWorkflowSecurity: this.getWorkflowSecurityConfig(currentWorkflow)?.security_level || 'unknown'
    });
    
    // SECURITY CHECK: If current workflow doesn't allow AI switching, return early
    if (!this.isAISwitchingEnabled(currentWorkflow)) {
      const securityConfig = this.getWorkflowSecurityConfig(currentWorkflow);
      logger.info('AI switching disabled for current workflow', {
        currentWorkflow,
        securityLevel: securityConfig?.security_level,
        reason: securityConfig?.reason
      });
      
      return {
        shouldSwitch: false,
        confidence: 0.95,
        reasoning: `Workflow switching disabled for ${currentWorkflow} (${securityConfig?.security_level} security)`
      };
    }
    
    // HIGH CONFIDENCE: Direct switch commands (unambiguous intent)
    const directSwitchPatterns = [
      { pattern: /^(switch to|change to|do a|make a|create a)\s+(blog article|blog post|blog)$/i, target: 'Blog Article', confidence: 0.95 },
      { pattern: /^(switch to|change to|do a|make a|create a)\s+(social post|social media|social)$/i, target: 'Social Post', confidence: 0.95 },
      { pattern: /^(switch to|change to|do a|make a|create a)\s+(press release|pr)$/i, target: 'Press Release', confidence: 0.95 },
      { pattern: /^(switch to|change to|do a|make a|create a)\s+(faq|faq document)$/i, target: 'FAQ', confidence: 0.95 },
      { pattern: /^(switch to|change to|do a|make a|create a)\s+(media pitch|pitch)$/i, target: 'Media Pitch', confidence: 0.95 }
    ];
    
    for (const { pattern, target, confidence } of directSwitchPatterns) {
      if (pattern.test(input)) {
        // SECURITY CHECK: Ensure target workflow allows AI switching
        if (!this.isAISwitchingEnabled(target)) {
          const targetSecurityConfig = this.getWorkflowSecurityConfig(target);
          logger.warn('Direct switch command detected but target workflow is security-restricted', {
            userInput,
            targetWorkflow: target,
            targetSecurityLevel: targetSecurityConfig?.security_level,
            reason: targetSecurityConfig?.reason
          });
          
          return {
            shouldSwitch: false,
            targetWorkflow: target,
            confidence: 0.95,
            reasoning: `${target} workflow has security restrictions (${targetSecurityConfig?.security_level}) that prevent automatic switching`
          };
        }
        
        logger.info('Direct workflow switch command detected', {
          userInput,
          targetWorkflow: target,
          pattern: pattern.source,
          confidence,
          targetSecurityLevel: this.getWorkflowSecurityConfig(target)?.security_level
        });
        
        return {
          shouldSwitch: true,
          targetWorkflow: target,
          confidence,
          reasoning: `Direct switch command detected`
        };
      }
    }
    
    // MEDIUM CONFIDENCE: Clear switch intent but less explicit
    const switchIntentPatterns = [
      // Handle "instead" at the end: "make a blog post instead", "do a social post instead" 
      // Also handle common typos: "insetad", "intead", etc.
      { pattern: /^(do|make|create)\s+a?\s*(blog article|blog post|blog)\s+(instead|insetad|intead|now)$/i, target: 'Blog Article', confidence: 0.9 },
      { pattern: /^(do|make|create)\s+a?\s*(social post|social)\s+(instead|insetad|intead|now)$/i, target: 'Social Post', confidence: 0.9 },
      { pattern: /^(do|make|create)\s+a?\s*(press release|pr)\s+(instead|insetad|intead|now)$/i, target: 'Press Release', confidence: 0.9 },
      { pattern: /^(do|make|create)\s+a?\s*(faq|faq document)\s+(instead|insetad|intead|now)$/i, target: 'FAQ', confidence: 0.9 },
      
      // Handle "instead" at the beginning: "instead do a blog post", "actually make a social post"
      { pattern: /^(actually|now|instead|insetad|intead)\s+(do|make|create)\s+a?\s*(blog|blog post|blog article)$/i, target: 'Blog Article', confidence: 0.9 },
      { pattern: /^(actually|now|instead|insetad|intead)\s+(do|make|create)\s+a?\s*(social|social post)$/i, target: 'Social Post', confidence: 0.9 },
      { pattern: /^(actually|now|instead|insetad|intead)\s+(do|make|create)\s+a?\s*(press release|pr)$/i, target: 'Press Release', confidence: 0.9 },
      { pattern: /^(actually|now|instead|insetad|intead)\s+(do|make|create)\s+a?\s*(faq|faq document)$/i, target: 'FAQ', confidence: 0.9 },
      
      // Handle target at beginning: "blog post instead", "social post now"
      { pattern: /^(blog|blog post|blog article)\s+(instead|insetad|intead|now)$/i, target: 'Blog Article', confidence: 0.9 },
      { pattern: /^(social|social post)\s+(instead|insetad|intead|now)$/i, target: 'Social Post', confidence: 0.9 },
      { pattern: /^(press release|pr)\s+(instead|insetad|intead|now)$/i, target: 'Press Release', confidence: 0.9 },
      { pattern: /^(faq|faq document)\s+(instead|insetad|intead|now)$/i, target: 'FAQ', confidence: 0.9 }
    ];
    
    for (const { pattern, target, confidence } of switchIntentPatterns) {
      if (pattern.test(input)) {
        // SECURITY CHECK: Ensure target workflow allows AI switching
        if (!this.isAISwitchingEnabled(target)) {
          const targetSecurityConfig = this.getWorkflowSecurityConfig(target);
          logger.warn('Switch intent detected but target workflow is security-restricted', {
            userInput,
            targetWorkflow: target,
            targetSecurityLevel: targetSecurityConfig?.security_level
          });
          
          return {
            shouldSwitch: false,
            targetWorkflow: target,
            confidence: 0.9,
            reasoning: `${target} workflow has security restrictions that prevent automatic switching`
          };
        }
        
        logger.info('Switch intent pattern detected', {
          userInput,
          targetWorkflow: target,
          pattern: pattern.source,
          confidence,
          targetSecurityLevel: this.getWorkflowSecurityConfig(target)?.security_level
        });
        
        return {
          shouldSwitch: true,
          targetWorkflow: target,
          confidence,
          reasoning: `Switch intent detected`
        };
      }
    }
    
    // AVOID FALSE POSITIVES: Reference patterns that should NOT trigger switches
    const referencePatterns = [
      /based on.*press release/i,
      /from.*press release/i,
      /using.*press release/i,
      /with.*press release/i,
      /the.*press release/i,
      /this.*press release/i,
      /above.*info/i,
      /previous.*info/i,
      /same.*info/i,
      /info.*above/i,
      /context.*from/i
    ];
    
    const isReference = referencePatterns.some(pattern => pattern.test(input));
    
    if (isReference) {
      logger.debug('Reference pattern detected - not a switch intent', {
        userInput,
        currentWorkflow,
        confidence: 0.95
      });
      
      return {
        shouldSwitch: false,
        confidence: 0.95,
        reasoning: 'User is referencing content, not requesting workflow switch'
      };
    }
    
    // LOW CONFIDENCE: Single word mentions (only if very clear context)
    if (input.length < 15) { // Short inputs might be commands
      const singleWordPatterns = [
        { pattern: /^blog$/i, target: 'Blog Article', confidence: 0.7 },
        { pattern: /^social$/i, target: 'Social Post', confidence: 0.7 },
        { pattern: /^faq$/i, target: 'FAQ', confidence: 0.7 }
      ];
      
      for (const { pattern, target, confidence } of singleWordPatterns) {
        if (pattern.test(input)) {
          // SECURITY CHECK: Ensure target workflow allows AI switching
          if (!this.isAISwitchingEnabled(target)) {
            logger.debug('Single word command detected but target workflow is security-restricted', {
              userInput,
              targetWorkflow: target
            });
            
            return {
              shouldSwitch: false,
              confidence: 0.8,
              reasoning: `${target} workflow has security restrictions`
            };
          }
          
          logger.debug('Single word command detected', {
            userInput,
            targetWorkflow: target,
            confidence,
            targetSecurityLevel: this.getWorkflowSecurityConfig(target)?.security_level
          });
          
          return {
            shouldSwitch: true,
            targetWorkflow: target,
            confidence,
            reasoning: `Single word command: "${input}"`
          };
        }
      }
    }

    logger.debug('No workflow switch intent detected', {
      userInput,
      currentWorkflow,
      confidence: 0.9
    });

    return {
      shouldSwitch: false,
      confidence: 0.9,
      reasoning: 'No workflow switch intent detected'
    };
  }

  /**
   * Get workflow by name
   */
  getWorkflowByName(name: string): WorkflowTemplate | null {
    const workflow = WORKFLOW_TEMPLATES[name as keyof typeof WORKFLOW_TEMPLATES];
    if (workflow) {
      logger.debug('Found workflow by name', { workflowName: name, workflowId: workflow.id });
      return workflow;
    }
    logger.warn('Workflow not found by name', { workflowName: name });
    return null;
  }

  /**
   * Get all available workflow names
   */
  getAvailableWorkflows(): string[] {
    return this.workflowOptions.map(w => w.name);
  }

  /**
   * Get workflow context for switching
   */
  getWorkflowSwitchContext(currentWorkflow: string, currentStep: string): WorkflowSwitchContext {
    return {
      current_workflow: currentWorkflow,
      current_step: currentStep,
      available_workflows: this.workflowOptions.filter(w => w.name !== currentWorkflow),
      switch_instructions: "User can request workflow switches at any time. Detect intent and offer switches with context transfer."
    };
  }

  /**
   * Get template ID by workflow name
   */
  getTemplateIdByName(name: string): string | undefined {
    const template = this.getWorkflowByName(name);
    return template?.id;
  }

  /**
   * Get workflow name by template ID
   */
  getWorkflowNameByTemplateId(templateId: string): string | undefined {
    logger.debug('Looking up workflow name by template ID', { 
      templateId,
      availableTemplates: Object.entries(WORKFLOW_TEMPLATES).map(([name, template]) => ({ name, id: template.id }))
    });
    
    for (const [name, template] of Object.entries(WORKFLOW_TEMPLATES)) {
      if (template.id === templateId) {
        logger.debug('Found workflow name by template ID', { templateId, workflowName: name });
        return name;
      }
    }
    
    logger.warn('No workflow found for template ID', { templateId });
    return undefined;
  }
}

// Singleton instance
export const workflowContextService = new WorkflowContextService(); 