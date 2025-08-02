import { WorkflowStep } from '../../types/workflow';
import { WorkflowSecurityContext } from './workflow-types.enhancement';

/**
 * Enhanced OpenAI Context Module
 * Provides enhanced system message construction with multiple context layers
 */

export class OpenAIContextEnhancer {

  /**
   * Construct enhanced system message with multiple context layers
   */
  constructEnhancedSystemMessage(
    step: WorkflowStep,
    contextLayers: {
      userProfile?: any;
      workflowContext?: any;
      conversationHistory?: any[];
      securityTags?: string[];
      securityGuidelines?: string[];
    },
    previousResponses: any[] = []
  ): string {
    let systemMessage = `You are a helpful AI assistant with access to organizational knowledge and conversation history.`;

    // Add user profile context if available
    if (contextLayers.userProfile) {
      const profile = contextLayers.userProfile;
      if (profile.companyName || profile.industry || profile.preferredTone || profile.jobTitle) {
        systemMessage += `\n\n📋 USER PROFILE:`;
        systemMessage += `\nBased on user knowledge, the user is a ${profile.jobTitle || 'team member'} at ${profile.companyName || '[Company]'}`;
        
        if (profile.industry) {
          systemMessage += ` in the ${profile.industry} industry`;
        }
        
        if (profile.preferredTone) {
          systemMessage += ` with a preferred tone of ${profile.preferredTone}`;
        }
        
        systemMessage += `. Always reference their company and role context when relevant to provide personalized, contextually aware responses. This is their primary workplace information that should inform all interactions.`;
      }
    }

    // Add workflow context
    if (contextLayers.workflowContext) {
      const wfContext = contextLayers.workflowContext;
      systemMessage += `\n\n🎯 WORKFLOW CONTEXT:`;
      systemMessage += `\nCurrently working on: ${wfContext.workflowType || 'Unknown Workflow'}`;
      if (wfContext.currentStep) {
        systemMessage += `\nCurrent step: ${wfContext.currentStep}`;
      }
      if (wfContext.templateId) {
        systemMessage += `\nTemplate: ${wfContext.templateId}`;
      }
    }

    // Add step-specific information
    systemMessage += `\n\n📝 CURRENT TASK: ${step.name}`;
    
    if (step.description) {
      systemMessage += `\nTask Description: ${step.description}`;
    }

    if (step.prompt) {
      systemMessage += `\nCurrent prompt: ${step.prompt}`;
    }

    // Add step metadata if available
    if (step.metadata && Object.keys(step.metadata).length > 0) {
      systemMessage += `\n\n📋 AVAILABLE OPTIONS:`;
      Object.entries(step.metadata).forEach(([key, value]) => {
        // Skip internal metadata fields
        if (['initialPromptSent', 'ragEnhanced', 'enhancedPrompt', 'smartDefaults'].includes(key)) {
          return;
        }
        
        if (Array.isArray(value)) {
          systemMessage += `\n${key}: ${value.join(', ')}`;
        } else if (typeof value === 'object') {
          systemMessage += `\n${key}: ${JSON.stringify(value)}`;
        } else {
          systemMessage += `\n${key}: ${value}`;
        }
      });
    }

    // Add conversation history context
    if (contextLayers.conversationHistory && contextLayers.conversationHistory.length > 0) {
      systemMessage += `\n\n💬 RECENT CONTEXT:`;
      systemMessage += `\nRecent conversation history (for context):`;
      contextLayers.conversationHistory.slice(-3).forEach((msg: any, index: number) => {
        const snippet = typeof msg.content === 'string' ? msg.content.substring(0, 100) : JSON.stringify(msg.content).substring(0, 100);
        systemMessage += `\n${index + 1}. ${msg.role}: ${snippet}${snippet.length >= 100 ? '...' : ''}`;
      });
    }

    // Add previous step responses
    if (previousResponses.length > 0) {
      systemMessage += `\n\n📋 PREVIOUS RESPONSES:`;
      systemMessage += `\nPrevious step completions:`;
      previousResponses.forEach(response => {
        systemMessage += `\n- ${response.stepName}: ${response.response}`;
      });
    }

    // Add security guidelines
    if (contextLayers.securityGuidelines && contextLayers.securityGuidelines.length > 0) {
      systemMessage += `\n\n🔒 SECURITY GUIDELINES:`;
      contextLayers.securityGuidelines.forEach(guideline => {
        systemMessage += `\n- ${guideline}`;
      });
    }

    // Add security-specific instructions based on tags
    if (contextLayers.securityTags && contextLayers.securityTags.length > 0) {
      systemMessage += `\n\n🔒 SECURITY REQUIREMENTS:`;
      if (contextLayers.securityTags.includes('contact_info')) {
        systemMessage += `\n- Handle contact information with extra care`;
      }
      if (contextLayers.securityTags.includes('pii')) {
        systemMessage += `\n- Protect personally identifiable information`;
      }
      if (contextLayers.securityTags.includes('financial')) {
        systemMessage += `\n- Secure handling of financial data required`;
      }
      if (contextLayers.securityTags.includes('workflow_restricted')) {
        systemMessage += `\n- This workflow has restricted data access`;
      }
      if (contextLayers.securityTags.includes('workflow_locked')) {
        systemMessage += `\n- This workflow has strict data isolation requirements`;
      }
    }

    // Add response guidelines based on step type and user preferences
    systemMessage += `\n\n✅ RESPONSE GUIDELINES:`;
    systemMessage += `\n1. Be professional and helpful`;
    
    if (contextLayers.userProfile?.preferredTone) {
      systemMessage += `\n2. Use a ${contextLayers.userProfile.preferredTone} tone`;
    } else {
      systemMessage += `\n2. Use a professional tone`;
    }
    
    if (contextLayers.userProfile?.companyName) {
      systemMessage += `\n3. Reference ${contextLayers.userProfile.companyName} context when relevant`;
    } else {
      systemMessage += `\n3. Reference company context when provided`;
    }
    
    systemMessage += `\n4. Focus on the current task: ${step.name}`;
    systemMessage += `\n5. Provide actionable, specific guidance`;
    
    // Add step-type specific guidelines
    const isChatStep = step.stepType === 'user_input' || step.stepType === 'ai_suggestion';
    if (isChatStep) {
      systemMessage += `\n6. Keep responses concise (1-2 sentences for chat interactions)`;
    } else {
      systemMessage += `\n6. Provide detailed, comprehensive responses for complex tasks`;
    }

    return systemMessage;
  }

  /**
   * Create context-aware system message for specific workflow types
   */
  constructWorkflowSpecificSystemMessage(
    step: WorkflowStep,
    workflowType: string,
    userProfile: any,
    securityContext: WorkflowSecurityContext
  ): string {
    let systemMessage = `You are a specialized ${workflowType} assistant.`;

    // Add workflow-specific expertise
    switch (workflowType) {
      case 'Press Release':
        systemMessage += ` You are an expert at creating professional press releases that follow industry standards and best practices.`;
        break;
      case 'Media Pitch':
        systemMessage += ` You are an expert at crafting compelling media pitches that journalists will want to cover.`;
        break;
      case 'Social Post':
        systemMessage += ` You are an expert at creating engaging social media content that drives engagement.`;
        break;
      case 'Blog Article':
        systemMessage += ` You are an expert at writing informative and engaging blog articles.`;
        break;
      default:
        systemMessage += ` You are an expert at ${workflowType.toLowerCase()} creation.`;
    }

    // Add user context
    if (userProfile?.companyName) {
      systemMessage += `\n\nYou are helping ${userProfile.companyName}`;
      if (userProfile.industry) {
        systemMessage += ` (${userProfile.industry} industry)`;
      }
      systemMessage += ` create their ${workflowType.toLowerCase()}.`;
    }

    // Add current step context
    systemMessage += `\n\nCurrent step: ${step.name}`;
    if (step.description) {
      systemMessage += `\n${step.description}`;
    }

    // Add security context
    if (!securityContext.aiSwitchingEnabled) {
      systemMessage += `\n\n⚠️  This workflow has AI processing restrictions. Follow all security guidelines carefully.`;
    }

    return systemMessage;
  }

  /**
   * Enhance user message with context for better AI understanding
   */
  enhanceUserMessage(
    userMessage: string,
    contextLayers: {
      userProfile?: any;
      workflowContext?: any;
      stepContext?: any;
    }
  ): string {
    let enhancedMessage = userMessage;

    // Add implicit context if the message is very short
    if (userMessage.length < 20 && contextLayers.stepContext) {
      enhancedMessage += `\n\n[Context: User is working on ${contextLayers.stepContext.stepName}`;
      if (contextLayers.workflowContext?.workflowType) {
        enhancedMessage += ` in a ${contextLayers.workflowContext.workflowType} workflow`;
      }
      if (contextLayers.userProfile?.companyName) {
        enhancedMessage += ` for ${contextLayers.userProfile.companyName}`;
      }
      enhancedMessage += `]`;
    }

    return enhancedMessage;
  }

  /**
   * Create debug context information for development
   */
  createDebugContext(
    step: WorkflowStep,
    contextLayers: any,
    securityContext: WorkflowSecurityContext
  ): any {
    return {
      stepInfo: {
        id: step.id,
        name: step.name,
        type: step.stepType,
        status: step.status,
        hasMetadata: !!step.metadata,
        metadataKeys: step.metadata ? Object.keys(step.metadata) : []
      },
      userProfile: {
        hasCompany: !!contextLayers.userProfile?.companyName,
        hasIndustry: !!contextLayers.userProfile?.industry,
        hasTone: !!contextLayers.userProfile?.preferredTone,
        hasJobTitle: !!contextLayers.userProfile?.jobTitle
      },
      workflowContext: contextLayers.workflowContext,
      securityInfo: {
        level: securityContext.securityLevel,
        tags: securityContext.securityTags,
        aiAllowed: securityContext.aiSwitchingEnabled,
        restrictions: securityContext.dataTransferRestrictions
      },
      contextSize: {
        conversationHistory: contextLayers.conversationHistory?.length || 0,
        securityGuidelines: contextLayers.securityGuidelines?.length || 0,
        securityTags: contextLayers.securityTags?.length || 0
      }
    };
  }
}

// Export singleton instance
export const openAIContextEnhancer = new OpenAIContextEnhancer(); 