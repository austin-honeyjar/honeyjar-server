import { WorkflowTemplate, StepType } from '../../types/workflow';

export const BASE_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: "base-workflow-template",
  name: "Base Workflow",
  description: "Initial workflow for selecting specific workflow type and setting thread title",
  steps: [
    {
      type: StepType.USER_INPUT,
      name: "Workflow Selection",
      description: "Select the type of workflow you'd like to create",
      prompt: "What type of workflow would you like to create?",
      order: 0,
      dependencies: [],
      metadata: {
        options: [
          "Launch Announcement",
          "Funding Round",
          "Partnership",
          "Company Milestone",
          "Executive Hire",
          "Industry Award",
          "Product Launch",
          "Event Promotion"
        ]
      }
    },
    {
      type: StepType.AI_SUGGESTION,
      name: "Thread Title and Summary",
      description: "Set the thread title and generate a summary subtitle",
      prompt: "What would you like to name this workflow?",
      order: 1,
      dependencies: ["Workflow Selection"]
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 