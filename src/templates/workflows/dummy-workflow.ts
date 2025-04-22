import { WorkflowTemplate, StepType } from '../../types/workflow';

export const DUMMY_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: "dummy-workflow-template",
  name: "Dummy Workflow",
  description: "Simple workflow for testing purposes",
  steps: [
    {
      type: StepType.AI_SUGGESTION,
      name: "Success Message",
      description: "Output a success message",
      prompt: "The workflow has completed successfully!",
      dependencies: [],
      metadata: {}
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 