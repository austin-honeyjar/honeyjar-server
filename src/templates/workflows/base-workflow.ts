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
      prompt: "What type of workflow would you like to create? Choose from: Launch Announcement, or Dummy Workflow.",
      order: 0,
      dependencies: [],
      metadata: {
        options: [
          "Launch Announcement",
          "Dummy Workflow"
        ],
        openai_instructions: "Analyze the user's input and determine which of the following workflow options it most closely matches: Launch Announcement or Dummy Workflow. Respond with ONLY the exact matching option name. If the user's input doesn't clearly match any option, select the closest match based on semantic meaning."
      }
    },
    {
      type: StepType.AI_SUGGESTION,
      name: "Thread Title and Summary",
      description: "Set the thread title and generate a summary subtitle",
      prompt: "What would you like to name this workflow?",
      order: 1,
      dependencies: ["Workflow Selection"],
      metadata: {
        openai_instructions: "Based on the user-provided title, generate a concise but descriptive subtitle that expands on the topic. The subtitle should provide additional context or detail about the purpose of this workflow. Keep the subtitle within 1-2 sentences. Format your response as: 'SUBTITLE: [your generated subtitle here]'"
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};