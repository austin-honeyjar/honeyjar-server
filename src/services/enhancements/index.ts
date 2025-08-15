/**
 * Workflow Service Enhancements
 * 
 * This module provides enhanced functionality for the workflow service including:
 * - RAG context integration with user profiles and smart defaults
 * - Security levels and content classification
 * - Enhanced OpenAI context with multiple layers
 * - Workflow orchestration with all enhancements combined
 * 
 * Usage in WorkflowService:
 * ```typescript
 * import { workflowOrchestrator, EnhancedStepResponse } from './enhancements';
 * 
 * // In your handleStepResponse method:
 * const enhanced = await workflowOrchestrator.processStepWithEnhancements(
 *   stepId, userInput, userId, orgId,
 *   this.handleStepResponse.bind(this),
 *   this.getWorkflow.bind(this),
 *   this.dbService.getStep.bind(this.dbService),
 *   this.updateStep.bind(this)
 * );
 * ```
 */

// Export types
export type { 
  EnhancedStepResponse, 
  ContextualMessage, 
  SmartDefaults, 
  WorkflowSecurityContext,
  SecurityLevel 
} from './workflow-types.enhancement';

// Export classes and instances
export { 
  RAGContextEnhancer, 
  ragContextEnhancer 
} from './rag-context.enhancement';

export { 
  SecurityEnhancer, 
  securityEnhancer 
} from './security.enhancement';

export { 
  OpenAIContextEnhancer, 
  openAIContextEnhancer 
} from './openai-context.enhancement';

export { 
  WorkflowOrchestrator, 
  workflowOrchestrator 
} from './workflow-orchestrator.enhancement';

// Main orchestrator is the primary interface
export { workflowOrchestrator as default } from './workflow-orchestrator.enhancement'; 