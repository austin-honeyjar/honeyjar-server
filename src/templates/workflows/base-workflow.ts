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
      prompt: "Which workflow would you like to use? Please choose from:\n\n• Launch Announcement - For product launches and announcements\n• JSON Dialog PR Workflow - For creating PR assets like press releases\n• Quick Press Release - For creating a press release in just two steps\n• Test Step Transitions - For testing step transitions and workflow completion\n• Dummy Workflow - For testing purposes\n• Media Matching - For generating prioritized media contact lists based on topic relevance",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Determine which workflow the user wants to create based on their input",
        options: [
          "Launch Announcement",
          "Dummy Workflow",
          "JSON Dialog PR Workflow",
          "Test Step Transitions",
          "Quick Press Release",
          "Media Matching"
        ],
        baseInstructions: `You are a workflow selection assistant. Your task is to match the user's input to one of the available workflows.

TASK:
Match user input to one of these workflows:
- Launch Announcement: For product launches, features, or news releases
- JSON Dialog PR Workflow: For creating press releases, media pitches, and PR assets
- Quick Press Release: For creating a press release in just two simple steps
- Test Step Transitions: For testing step transitions and workflow completion
- Dummy Workflow: For testing and demonstration purposes
- Media Matching: For generating prioritized media contact lists based on topic relevance

MATCHING RULES:
- If user mentions "PR", "press release", "press", choose "JSON Dialog PR Workflow"
- If user mentions "launch", "announcement", "product", choose "Launch Announcement" 
- If user mentions "test", "dummy", "sample", "demo", choose "Dummy Workflow"
- If user mentions "step", "transition", "test steps", choose "Test Step Transitions"
- If user mentions "quick", "fast", "simple", "easy", choose "Quick Press Release"
- If user mentions "media matching", "media contacts", "media list", "journalists", "reporters", choose "Media Matching"
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
  "suggestedNextStep": "Auto Generate Thread Title" 
}`
      }
    },
    {
      type: StepType.GENERATE_THREAD_TITLE,
      name: "Auto Generate Thread Title",
      description: "Automatically generate thread title based on selected workflow and current date",
      prompt: "", // No prompt needed for auto-generation
      order: 1,
      dependencies: ["Workflow Selection"],
      metadata: {
        goal: "Automatically generate thread title based on selected workflow and current date",
        autoExecute: true,
        silent: true, // Don't send messages to user
        titleTemplate: "{workflowType} - {date}"
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};