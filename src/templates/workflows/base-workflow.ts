import { WorkflowTemplate, StepType } from '../../types/workflow';

export const BASE_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: "base-workflow-template",
  name: "Base Workflow",
  description: "Initial workflow for selecting specific workflow type and setting thread title",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Workflow Selection",
      description: "Select the type of workflow you'd like to create",
      prompt: "Which workflow would you like to create?\n\n• Launch Announcement - For product launches and announcements\n• JSON Dialog PR Workflow - For creating PR assets like press releases\n• Dummy Workflow - For testing purposes",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Determine which workflow the user wants to create based on their input",
        options: [
          "Launch Announcement",
          "Dummy Workflow",
          "JSON Dialog PR Workflow"
        ],
        baseInstructions: `You are a workflow selection assistant. Your task is to match the user's input to one of the available workflows.

TASK:
Match user input to one of these workflows:
- Launch Announcement: For product launches, features, or news releases
- JSON Dialog PR Workflow: For creating press releases, media pitches, and PR assets
- Dummy Workflow: For testing and demonstration purposes

MATCHING RULES:
- If user mentions "PR", "press release", "press", choose "JSON Dialog PR Workflow"
- If user mentions "launch", "announcement", "product", choose "Launch Announcement" 
- If user mentions "test", "dummy", "sample", "demo", choose "Dummy Workflow"
- If no clear match, ask user to clarify with choices

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:
{
  "isComplete": true/false,
  "isMatch": true/false,
  "collectedInformation": {
    "selectedWorkflow": "EXACT NAME FROM OPTIONS LIST",
    "confidence": "high/low"
  },
  "nextQuestion": "Your clarification question if needed, otherwise null",
  "suggestedNextStep": "Thread Title and Summary" 
}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Thread Title and Summary",
      description: "Set the thread title and generate a summary subtitle",
      prompt: "What would you like to name this thread workspace?",
      order: 1,
      dependencies: ["Workflow Selection"],
      metadata: {
        goal: "Get a title for the thread from the user and generate a professional subtitle that adds context"
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};