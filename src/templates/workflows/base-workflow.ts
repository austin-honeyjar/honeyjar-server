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
        openai_instructions: `You are a workflow selection assistant. Your task is to determine which workflow the user wants to create based on their input.

AVAILABLE WORKFLOWS:
- Launch Announcement: For announcing product launches, features, or news
- Dummy Workflow: For testing purposes or sample workflows

RULES:
1. ONLY respond with an EXACT match from the available workflows list
2. If the user's input doesn't clearly indicate a preference, respond with "NO_MATCH"
3. If the user expresses a negative preference (e.g., "not X", "don't use X"), respond with "NO_MATCH"
4. If the user seems confused or is asking questions, respond with "NO_MATCH"
5. The workflow name must be returned EXACTLY as shown above, with correct capitalization
6. NEVER provide explanations or additional text in your response

EXAMPLES:
User: "launch"
Response: Launch Announcement

User: "announcement"
Response: Launch Announcement

User: "dummy"
Response: Dummy Workflow

User: "test"
Response: Dummy Workflow

User: "not dummy, the other one"
Response: Launch Announcement

User: "launch please"
Response: Launch Announcement

User: "what are the options?"
Response: NO_MATCH

User: "something else"
Response: NO_MATCH

User: "I need to announce our new product"
Response: Launch Announcement

Your response must be ONLY the workflow name or "NO_MATCH" - no other text.`
      }
    },
    {
      type: StepType.AI_SUGGESTION,
      name: "Thread Title and Summary",
      description: "Set the thread title and generate a summary subtitle",
      prompt: "What would you like to name this thread workspace?",
      order: 1,
      dependencies: ["Workflow Selection"],
      metadata: {
        openai_instructions: `You are a subtitle generation assistant. The user has provided a title for their workflow, and you need to generate a brief, professional subtitle that expands on the title and adds context.

TASK:
Generate a concise, descriptive subtitle (1-2 sentences) that elaborates on the user's title and provides additional context about the purpose or benefits of the workflow.

RULES:
1. The subtitle should be professional and clear
2. Keep it concise - no more than 2 sentences
3. Add meaningful context that enhances the title
4. Focus on benefits or purpose when possible
5. DO NOT simply restate the title
6. Return ONLY the subtitle prefixed with "SUBTITLE:"

EXAMPLES:

Title: "Q4 Product Launch"
SUBTITLE: A comprehensive plan for announcing our newest product line in the fourth quarter with maximum market impact.

Title: "New Feature Announcement"
SUBTITLE: Strategic communication plan for rolling out the latest platform enhancements to customers and stakeholders.

Title: "Marketing Campaign 2023"
SUBTITLE: Framework for executing our flagship promotional campaign with coordinated messaging across all media channels.

Your response must begin with "SUBTITLE:" followed by your generated subtitle - no other text or explanation.`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};