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
        baseInstructions: `You are a workflow selection assistant. Your task is to match the user's input to one of the available workflows.

TASK:
Match user input to one of these workflows:
- Launch Announcement: For product launches, features, or news releases
- JSON Dialog PR Workflow: For creating press releases, media pitches, and PR assets
- Media List Generator: Database search + dual ranking (algorithmic vs AI) with user choice
- Media Matching: AI author suggestions validated with recent article analysis
- Press Release: For creating professional press release announcements
- Media Pitch: For creating personalized media outreach and pitches
- Social Post: For creating social media content in your brand voice
- Blog Article: For creating long-form content, POVs, and narratives
- FAQ: For creating comprehensive FAQ documents
- Quick Press Release: For creating a press release in just two simple steps
- Test Step Transitions: For testing step transitions and workflow completion
- Dummy Workflow: For testing and demonstration purposes

MATCHING RULES:
- If user mentions "PR", "press release", "announcement materials", choose "Press Release"
- If user mentions "media pitch", "pitch", "outreach", "journalist outreach", choose "Media Pitch"
- If user mentions "social", "social media", "social post", "brand voice", choose "Social Post"
- If user mentions "blog", "article", "long-form", "POV", "narrative", choose "Blog Article"
- If user mentions "FAQ", "questions", "frequently asked", choose "FAQ"
- If user mentions "launch", "product launch", "announcement", choose "Launch Announcement" 
- If user mentions "JSON Dialog PR", "dialog", choose "JSON Dialog PR Workflow"
- If user mentions "quick", "fast", "simple", "easy", choose "Quick Press Release"
- If user mentions "media list", "media contacts list", "contact list", "dual ranking", "algorithmic vs AI", choose "Media List Generator"
- If user mentions "media matching", "author validation", "AI suggestions", "article analysis", choose "Media Matching"
- If user mentions "test", "dummy", "sample", "demo", choose "Dummy Workflow"
- If user mentions "step", "transition", "test steps", choose "Test Step Transitions"
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