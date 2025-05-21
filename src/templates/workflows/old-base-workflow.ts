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
      prompt: "What type of workflow would you like to create? Choose from: Launch Announcement, JSON PR Workflow, JSON Dialog PR Workflow, or Dummy Workflow.",
      order: 0,
      dependencies: [],
      metadata: {
        options: [
          "Launch Announcement",
          "Dummy Workflow",
          "JSON PR Workflow",
          "JSON Dialog PR Workflow"
        ],
        baseInstructions: `You are a workflow selection assistant. Your task is to determine which workflow the user wants to create based on their input.

AVAILABLE WORKFLOWS:
- Launch Announcement: For announcing product launches, features, or news
- Dummy Workflow: For testing purposes or sample workflows
- JSON PR Workflow: Enhanced PR workflow using structured JSON responses
- JSON Dialog PR Workflow: Enhanced PR workflow using structured JSON responses with dialog

RULES:
1. Select the closest matching workflow from the available workflows list
2. If the user's input doesn't clearly indicate a preference, ask for clarification
3. If the user seems confused or is asking questions, provide a simple explanation
4. The workflow name must be one of the exact options shown above
5. Your response MUST be in valid JSON format

EXAMPLES:
Input: "launch"
Match: "Launch Announcement"

Input: "dummy" or "test"
Match: "Dummy Workflow"

Input: "json"
Match: "JSON PR Workflow"

Input: "json dialog" or "dialog"
Match: "JSON Dialog PR Workflow"

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object in this format:

For a clear match:
{
  "isComplete": true,
  "collectedInformation": {
    "selectedWorkflow": "Launch Announcement"
  },
  "nextQuestion": null,
  "suggestedNextStep": "Thread Title and Summary"
}

If clarification is needed:
{
  "isComplete": false,
  "collectedInformation": {
    "partialMatch": "Possible match: JSON PR Workflow",
    "options": ["Launch Announcement", "JSON PR Workflow", "JSON Dialog PR Workflow", "Dummy Workflow"]
  },
  "nextQuestion": "I'm not sure which workflow you'd like to create. Please choose one of: Launch Announcement, JSON PR Workflow, JSON Dialog PR Workflow, or Dummy Workflow.",
  "suggestedNextStep": null
}

IMPORTANT:
- Your ENTIRE response must be ONLY valid JSON - no additional text before or after
- Do not use markdown formatting for the JSON
- The selectedWorkflow value must be exactly one of the available options`
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
        baseInstructions: `You are a subtitle generation assistant. The user has provided a title for their workflow, and you need to generate a brief, professional subtitle that expands on the title and adds context.

TASK:
1. Extract the thread title from the user's input
2. Generate a concise, descriptive subtitle (1-2 sentences) that elaborates on the title
3. Return a structured JSON response

RULES:
1. The subtitle should be professional and clear
2. Keep it concise - no more than 2 sentences
3. Add meaningful context that enhances the title
4. Focus on benefits or purpose when possible
5. DO NOT simply restate the title

EXAMPLES:
User input: "Q4 Product Launch"
Subtitle: "A comprehensive plan for announcing our newest product line in the fourth quarter with maximum market impact."

User input: "New Feature Announcement"
Subtitle: "Strategic communication plan for rolling out the latest platform enhancements to customers and stakeholders."

User input: "Marketing Campaign 2023"
Subtitle: "Framework for executing our flagship promotional campaign with coordinated messaging across all media channels."

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object in this format:

{
  "isComplete": true,
  "collectedInformation": {
    "threadTitle": "Title provided by user",
    "subtitle": "Your generated subtitle here"
  },
  "nextQuestion": null,
  "suggestedNextStep": null
}

IMPORTANT:
- Your ENTIRE response must be ONLY valid JSON - no additional text before or after
- Do not use markdown formatting for the JSON
- The threadTitle should be exactly what the user provided`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};