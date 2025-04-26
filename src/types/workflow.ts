export enum StepStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETE = "complete",
  FAILED = "failed",
}

export enum WorkflowStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum StepType {
  AI_SUGGESTION = "ai_suggestion",
  USER_INPUT = "user_input",
  API_CALL = "api_call",
  DATA_TRANSFORMATION = "data_transformation",
}

export enum WorkflowAction {
  START = "start",
  COMPLETE_STEP = "complete_step",
  FAIL_STEP = "fail_step",
  ROLLBACK_STEP = "rollback_step",
  COMPLETE = "complete",
  FAIL = "fail",
  ROLLBACK = "rollback",
}

export interface WorkflowValidationError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: WorkflowValidationError[];
  warnings: WorkflowValidationError[];
}

export interface WorkflowState {
  status: WorkflowStatus;
  stepStatuses: Record<string, StepStatus>;
  metadata: Record<string, any>;
}

export interface WorkflowHistoryEntry {
  id: string;
  workflowId: string;
  stepId?: string;
  action: WorkflowAction;
  previousState: WorkflowState;
  newState: WorkflowState;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepType: StepType;
  name: string;
  description: string;
  prompt?: string;
  status: StepStatus;
  order: number;
  dependencies: string[];
  metadata?: Record<string, any>;
  aiSuggestion?: string;
  userInput?: string;
  openAIPrompt?: string;
  openAIResponse?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workflow {
  id: string;
  threadId: string;
  templateId: string;
  status: WorkflowStatus;
  currentStepId: string | null;
  steps: WorkflowStep[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    type: StepType;
    name: string;
    description: string;
    prompt?: string;
    order?: number;
    dependencies: string[];
    metadata?: Record<string, any>;
  }>;
  createdAt: Date;
  updatedAt: Date;
} 