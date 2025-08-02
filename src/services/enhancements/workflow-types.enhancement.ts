import { WorkflowStep } from '../../types/workflow';

/**
 * Enhanced interfaces for workflow service upgrades
 * Import and use these in the main workflow service
 */

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
  securityLevel?: 'public' | 'internal' | 'confidential' | 'restricted';
  contextLayers?: {
    userProfile?: any;
    workflowContext?: any;
    conversationHistory?: any[];
    securityTags?: string[];
  };
}

export interface ContextualMessage {
  content: string;
  role: 'user' | 'assistant' | 'system';
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  securityTags: string[];
  contextLayers: {
    userProfile?: any;
    workflowContext?: any;
    conversationHistory?: any[];
  };
  metadata?: {
    workflowId?: string;
    stepId?: string;
    timestamp?: number;
    ragEnhanced?: boolean;
  };
}

export interface SmartDefaults {
  companyName?: string;
  industry?: string;
  preferredTone?: string;
  suggestedContent?: string;
  relatedExamples?: Array<{
    type: string;
    content: string;
    context: string;
  }>;
}

export interface WorkflowSecurityContext {
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  securityTags: string[];
  workflowType: string;
  aiSwitchingEnabled: boolean;
  dataTransferRestrictions: string[];
}

export type SecurityLevel = 'public' | 'internal' | 'confidential' | 'restricted'; 