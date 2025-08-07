import logger from '../utils/logger';

export interface WorkflowSecurityConfig {
  securityLevel: 'open' | 'restricted' | 'locked';
  aiSwitchingEnabled: boolean;
  aiContextHeadersEnabled: boolean;
  dataTransferRestrictions: string[];
  reason?: string;
}

export interface WorkflowSwitchResult {
  allowed: boolean;
  reason?: string;
  alternative?: string;
}

export class WorkflowSecurityService {
  
  // Security configuration for all workflows
  private readonly WORKFLOW_SECURITY_CONFIG: Record<string, WorkflowSecurityConfig> = {
    // OPEN WORKFLOWS (Full AI Features)
    'Press Release': {
      securityLevel: 'open',
      aiSwitchingEnabled: true,
      aiContextHeadersEnabled: true,
      dataTransferRestrictions: []
    },
    'Social Post': {
      securityLevel: 'open',
      aiSwitchingEnabled: true,
      aiContextHeadersEnabled: true,
      dataTransferRestrictions: []
    },
    'Blog Article': {
      securityLevel: 'open',
      aiSwitchingEnabled: true,
      aiContextHeadersEnabled: true,
      dataTransferRestrictions: []
    },
    'FAQ': {
      securityLevel: 'open',
      aiSwitchingEnabled: true,
      aiContextHeadersEnabled: true,
      dataTransferRestrictions: []
    },
    'Media Pitch': {
      securityLevel: 'open',
      aiSwitchingEnabled: true,
      aiContextHeadersEnabled: true,
      dataTransferRestrictions: []
    },
    
    // RESTRICTED WORKFLOWS (Limited AI)
    'Media List Generator': {
      securityLevel: 'restricted',
      aiSwitchingEnabled: false,
      aiContextHeadersEnabled: false,
      dataTransferRestrictions: ['contact_info', 'email_addresses'],
      reason: 'Contains sensitive media contact information'
    },
    'Media Matching': {
      securityLevel: 'restricted',
      aiSwitchingEnabled: false,
      aiContextHeadersEnabled: false,
      dataTransferRestrictions: ['contact_info', 'email_addresses'],
      reason: 'Contains sensitive media contact information'
    },
    
    // LOCKED WORKFLOWS (No AI Processing)
    'JSON Dialog PR Workflow': {
      securityLevel: 'locked',
      aiSwitchingEnabled: false,
      aiContextHeadersEnabled: false,
      dataTransferRestrictions: ['all'],
      reason: 'Legacy workflow with strict data isolation'
    },
    'Test Step Transitions': {
      securityLevel: 'locked',
      aiSwitchingEnabled: false,
      aiContextHeadersEnabled: false,
      dataTransferRestrictions: ['all'],
      reason: 'Development/testing workflow'
    },
    'Dummy Workflow': {
      securityLevel: 'locked',
      aiSwitchingEnabled: false,
      aiContextHeadersEnabled: false,
      dataTransferRestrictions: ['all'],
      reason: 'Development/testing workflow'
    }
  };

  /**
   * Get security configuration for a workflow
   */
  getWorkflowSecurity(workflowName: string): WorkflowSecurityConfig {
    const config = this.WORKFLOW_SECURITY_CONFIG[workflowName];
    
    if (!config) {
      // Default to LOCKED for unknown workflows (security-first approach)
      logger.warn(`Unknown workflow "${workflowName}" - defaulting to LOCKED security`);
      return {
        securityLevel: 'locked',
        aiSwitchingEnabled: false,
        aiContextHeadersEnabled: false,
        dataTransferRestrictions: ['all'],
        reason: 'Unknown workflow - default security restrictions applied'
      };
    }
    
    return config;
  }

  /**
   * Check if AI switching is enabled for a workflow
   */
  isAISwitchingEnabled(workflowName: string): boolean {
    const config = this.getWorkflowSecurity(workflowName);
    return config.aiSwitchingEnabled;
  }

  /**
   * Check if AI context headers are enabled for a workflow
   */
  isAIContextHeadersEnabled(workflowName: string): boolean {
    const config = this.getWorkflowSecurity(workflowName);
    return config.aiContextHeadersEnabled;
  }

  /**
   * Validate a workflow switch request
   */
  validateWorkflowSwitch(fromWorkflow: string, toWorkflow: string): WorkflowSwitchResult {
    const fromConfig = this.getWorkflowSecurity(fromWorkflow);
    const toConfig = this.getWorkflowSecurity(toWorkflow);

    // Check if switching FROM current workflow is allowed
    if (!fromConfig.aiSwitchingEnabled) {
      logger.info(`AI switching blocked from ${fromWorkflow} (security: ${fromConfig.securityLevel})`);
      return {
        allowed: false,
        reason: `${fromWorkflow} workflow has security restrictions that prevent automatic switching. Please start a new conversation for ${toWorkflow}.`,
        alternative: 'Press Release' // Safe default
      };
    }

    // Check if switching TO target workflow is allowed
    if (toConfig.securityLevel !== 'open') {
      logger.info(`AI switching blocked to ${toWorkflow} (security: ${toConfig.securityLevel})`);
      return {
        allowed: false,
        reason: `${toWorkflow} workflow has security restrictions. Please start a new conversation for that workflow.`,
        alternative: 'Press Release' // Safe default
      };
    }

    // Switch is allowed
    logger.info(`AI switching allowed: ${fromWorkflow} → ${toWorkflow}`);
    return {
      allowed: true
    };
  }

  /**
   * Filter data based on transfer restrictions
   */
  filterDataForTransfer(data: any, workflowName: string): any {
    const config = this.getWorkflowSecurity(workflowName);
    const restrictions = config.dataTransferRestrictions;

    if (restrictions.includes('all')) {
      logger.info(`All data transfer blocked for ${workflowName}`);
      return {};
    }

    if (restrictions.length === 0) {
      return data; // No restrictions
    }

    // Filter out restricted fields
    const filteredData = { ...data };
    
    restrictions.forEach(restriction => {
      switch (restriction) {
        case 'contact_info':
          delete filteredData.contacts;
          delete filteredData.mediaContacts;
          delete filteredData.contactList;
          break;
        case 'email_addresses':
          delete filteredData.emails;
          delete filteredData.emailAddresses;
          // Sanitize any email addresses in text fields
          if (filteredData.content) {
            filteredData.content = this.sanitizeEmailAddresses(filteredData.content);
          }
          break;
      }
    });

    logger.info(`Filtered data for ${workflowName}, restrictions: ${restrictions.join(', ')}`);
    return filteredData;
  }

  /**
   * Generate AI context headers for workflows
   */
  generateAIContextHeaders(workflowName: string): string {
    const config = this.getWorkflowSecurity(workflowName);
    
    if (!config.aiContextHeadersEnabled) {
      logger.info(`AI context headers disabled for ${workflowName}`);
      return '';
    }

    // Only include OPEN workflows in context headers
    const availableWorkflows = Object.entries(this.WORKFLOW_SECURITY_CONFIG)
      .filter(([name, config]) => config.securityLevel === 'open')
      .map(([name]) => name);

    const contextHeader = `
AVAILABLE WORKFLOWS:
${availableWorkflows.map(name => `- ${name}: ${this.getWorkflowDescription(name)}`).join('\n')}

WORKFLOW SWITCHING:
If the user requests switching to a different content type, respond with:
{"workflow_switch_detected": true, "target_workflow": "WorkflowName"}

TONE GUIDELINES:
- Professional and helpful
- Concise but thorough
- Ask clarifying questions when needed
`;

    logger.info(`Generated AI context headers for ${workflowName}`);
    return contextHeader;
  }

  /**
   * Get list of all open (AI-safe) workflows
   */
  getOpenWorkflows(): string[] {
    return Object.entries(this.WORKFLOW_SECURITY_CONFIG)
      .filter(([name, config]) => config.securityLevel === 'open')
      .map(([name]) => name);
  }

  /**
   * Get security audit log for a workflow
   */
  getSecurityAuditInfo(workflowName: string): Record<string, any> {
    const config = this.getWorkflowSecurity(workflowName);
    
    return {
      workflowName,
      securityLevel: config.securityLevel,
      aiSwitchingEnabled: config.aiSwitchingEnabled,
      aiContextHeadersEnabled: config.aiContextHeadersEnabled,
      dataTransferRestrictions: config.dataTransferRestrictions,
      reason: config.reason,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Private helper to get workflow descriptions
   */
  private getWorkflowDescription(workflowName: string): string {
    const descriptions: Record<string, string> = {
      'Press Release': 'company announcements, funding news',
      'Social Post': 'social media, quick announcements',
      'Blog Article': 'thought leadership, detailed content',
      'FAQ': 'customer support, common questions',
      'Media Pitch': 'media outreach, story pitches'
    };
    
    return descriptions[workflowName] || 'content creation';
  }

  /**
   * Private helper to sanitize email addresses from text
   */
  private sanitizeEmailAddresses(text: string): string {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return text.replace(emailRegex, '[EMAIL_REMOVED]');
  }
} 