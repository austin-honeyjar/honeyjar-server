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
      prompt: "Which workflow would you like to use? Please choose from:\n\n**Full Workflows:**\n• Launch Announcement - For product launches and announcements\n• JSON Dialog PR Workflow - For creating PR assets like press releases\n• Media List Generator - Generate media contacts with dual ranking (algorithmic vs AI) and user choice\n• Media Matching - AI-suggested authors validated with recent article analysis\n\n**Quick Asset Creation:**\n• Press Release - Draft PR announcement materials\n• Media Pitch - Build custom outreach with context\n• Social Post - Craft social copy in your brand voice\n• Blog Article - Create long-form POVs, news, or narratives\n• FAQ - Generate frequent questions and suggested responses\n• Quick Press Release - For creating a press release in just two steps\n\n**Testing & Development:**\n• Test Step Transitions - For testing step transitions and workflow completion\n• Dummy Workflow - For testing purposes",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Determine which workflow the user wants to create based on their input",
        options: [
          "Launch Announcement",
          "JSON Dialog PR Workflow",
          "Media List Generator",
          "Media Matching",
          "Press Release",
          "Media Pitch",
          "Social Post",
          "Blog Article",
          "FAQ",
          "Quick Press Release",
          "Test Step Transitions",
          "Dummy Workflow"
        ],
        baseInstructions: `You are a PR workflow assistant.

AVAILABLE WORKFLOWS:
- Launch Announcement: For product launches and announcements
- JSON Dialog PR Workflow: For creating PR assets like press releases  
- Media List Generator: Generate media contacts with dual ranking
- Media Matching: AI-suggested authors with article analysis
- Press Release: Draft PR announcement materials
- Media Pitch: Build custom outreach with context
- Social Post: Craft social copy in your brand voice
- Blog Article: Create long-form POVs, news, or narratives
- FAQ: Generate frequent questions and responses
- Quick Press Release: Two-step press release creation
- Test Step Transitions: For testing workflow completion
- Dummy Workflow: For testing purposes

USER CONTEXT: Available via enhanced context injection

TASK: Determine if user intent matches one of these workflows with HIGH CONFIDENCE.
- If YES → Select the workflow
- If NO → Provide conversational response

RESPONSE FORMAT:

WORKFLOW MATCHED (high confidence):
{
  "mode": "workflow_selection",
  "isComplete": true,
  "isMatch": true,
  "collectedInformation": {
    "selectedWorkflow": "EXACT_WORKFLOW_NAME"
  },
  "suggestedNextStep": "Auto Generate Thread Title"
}

NO CLEAR MATCH (questions, general chat):
{
  "mode": "conversational",
  "isComplete": true,
  "isMatch": false,
  "collectedInformation": {
    "selectedWorkflow": null,
    "conversationalResponse": "Your helpful response here"
  },
  "suggestedNextStep": "Auto Generate Thread Title"
}
`
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