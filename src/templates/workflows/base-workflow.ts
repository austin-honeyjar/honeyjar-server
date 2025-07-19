import { WorkflowTemplate, StepType } from '../../types/workflow';

export const BASE_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: "base-workflow-template",
  name: "Base Workflow",
  description: "Enhanced workflow selection with smart intent detection and graceful switching",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Workflow Selection",
      description: "Select the type of workflow you'd like to create with enhanced switching support",
      prompt: "Which workflow would you like to use? Please choose from:\n\n**Full Workflows:**\n• Launch Announcement - For product launches and announcements\n• JSON Dialog PR Workflow - For creating PR assets like press releases\n• Media Matching - For generating prioritized media contact lists based on topic relevance\n\n**Quick Asset Creation:**\n• Press Release - Draft PR announcement materials\n• Media Pitch - Build custom outreach with context\n• Social Post - Craft social copy in your brand voice\n• Blog Article - Create long-form POVs, news, or narratives\n• FAQ - Generate frequent questions and suggested responses\n• Quick Press Release - For creating a press release in just two steps\n\n**Testing & Development:**\n• Test Step Transitions - For testing step transitions and workflow completion\n• Dummy Workflow - For testing purposes\n\n💡 **Tip:** You can also describe what you want to create (e.g., \"I need a social media post about our product launch\") and I'll recommend the best workflow!",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Determine which workflow the user wants to create based on their input with enhanced flexibility",
        options: [
          "Launch Announcement",
          "JSON Dialog PR Workflow", 
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
        // Enhanced workflow switching configuration
        allowedTransitions: [
          "Press Release",
          "Social Post", 
          "Media Pitch",
          "Blog Article",
          "FAQ",
          "Media Matching",
          "Launch Announcement"
        ],
        cancellationPolicy: "always",
        helpText: "I can help you choose the right workflow based on what you want to create",
        examples: [
          "Press Release - for announcing company news, product launches, or achievements",
          "Social Post - for creating engaging social media content",
          "Media Pitch - for reaching out to journalists and media contacts",
          "Blog Article - for thought leadership and long-form content"
        ],
        baseInstructions: `You are an enhanced workflow selection assistant with smart intent detection. Your task is to match the user's input to one of the available workflows while providing helpful guidance and flexibility.

ENHANCED CAPABILITIES:
- Detect when users want to switch workflows mid-conversation
- Provide helpful guidance when users are unsure
- Handle cancellation requests gracefully
- Suggest alternatives when requests are unclear

TASK:
Match user input to one of these workflows with enhanced understanding:
- Launch Announcement: For product launches, features, or news releases
- JSON Dialog PR Workflow: For creating press releases, media pitches, and PR assets
- Media Matching: For generating prioritized media contact lists based on topic relevance
- Press Release: For creating professional press release announcements
- Media Pitch: For creating personalized media outreach and pitches
- Social Post: For creating social media content in your brand voice
- Blog Article: For creating long-form content, POVs, and narratives
- FAQ: For creating comprehensive FAQ documents
- Quick Press Release: For creating a press release in just two simple steps
- Test Step Transitions: For testing step transitions and workflow completion
- Dummy Workflow: For testing and demonstration purposes

ENHANCED MATCHING RULES:
- If user mentions "PR", "press release", "announcement materials", choose "Press Release"
- If user mentions "media pitch", "pitch", "outreach", "journalist outreach", choose "Media Pitch"
- If user mentions "social", "social media", "social post", "brand voice", choose "Social Post"
- If user mentions "blog", "article", "long-form", "POV", "narrative", choose "Blog Article"
- If user mentions "questions", "FAQ", "Q&A", "answers", choose "FAQ"
- If user mentions "media list", "journalist list", "contacts", "media matching", choose "Media Matching"
- If user mentions "launch", "product launch", "announcement", choose "Launch Announcement"

INTENT DETECTION:
- Detect cancellation requests: "nevermind", "stop", "cancel", "quit"
- Detect confusion: "I don't know", "what should I choose", "help me decide"
- Detect workflow switches: "actually I want X", "change to Y", "do Z instead"

RESPONSE HANDLING:
- For clear workflow selections: Return the selected workflow name
- For confusion: Provide helpful guidance and examples
- For cancellation: Acknowledge and offer alternatives
- For unclear input: Ask clarifying questions with specific options

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

For successful workflow selection:
{
  "isComplete": true,
  "collectedInformation": {
    "selectedWorkflow": "[EXACT WORKFLOW NAME]"
  },
  "nextQuestion": null,
  "readyToGenerate": false
}

For clarification needed:
{
  "isComplete": false,
  "collectedInformation": {},
  "nextQuestion": "I'd be happy to help you choose the right workflow. [helpful guidance and specific options]",
  "readyToGenerate": false
}

For cancellation requests:
{
  "isComplete": true,
  "collectedInformation": {
    "selectedWorkflow": "cancelled"
  },
  "nextQuestion": "No problem! Feel free to return when you're ready to create content.",
  "readyToGenerate": false
}

WORKFLOW NAMES (use these EXACT names in selectedWorkflow):
- "Launch Announcement"
- "JSON Dialog PR Workflow"
- "Media Matching"
- "Press Release"
- "Media Pitch"
- "Social Post"
- "Blog Article"
- "FAQ"
- "Quick Press Release"
- "Test Step Transitions"
- "Dummy Workflow"

IMPORTANT: Always use the EXACT workflow names listed above. Do not modify or shorten them.`,
        initialPromptSent: false,
        openai_instructions: `Enhanced workflow selection with smart matching and intent detection. 

If the user's input is unclear or could match multiple workflows, provide helpful guidance. If they seem confused, offer specific examples. If they want to cancel, handle it gracefully.

Examples of good responses:

For "I want to announce our new product":
{
  "isComplete": true,
  "collectedInformation": {"selectedWorkflow": "Press Release"},
  "nextQuestion": null,
  "readyToGenerate": false
}

For "I'm not sure what I need":
{
  "isComplete": false,
  "collectedInformation": {},
  "nextQuestion": "I'd be happy to help! What type of content do you want to create? For example: announcements (Press Release), social media content (Social Post), journalist outreach (Media Pitch), or long-form content (Blog Article)?",
  "readyToGenerate": false
}

For "never mind":
{
  "isComplete": true,
  "collectedInformation": {"selectedWorkflow": "cancelled"},
  "nextQuestion": "No problem! Feel free to return when you're ready to create content.",
  "readyToGenerate": false
}`
      }
    },
    {
      type: StepType.GENERATE_THREAD_TITLE,
      name: "Auto Generate Thread Title",
      description: "Automatically generate a thread title based on the selected workflow",
      prompt: "",
      order: 1,
      dependencies: ["Workflow Selection"],
      metadata: {
        goal: "Generate a contextual thread title based on the selected workflow",
        autoExecute: true,
        titleFormat: "{selectedWorkflow} - {currentDate}",
        contextAware: true
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};