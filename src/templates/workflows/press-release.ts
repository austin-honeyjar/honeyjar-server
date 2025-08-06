import { WorkflowTemplate, StepType } from "../../types/workflow";

export const PRESS_RELEASE_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000008",
  name: "Press Release",
  description: "Draft PR announcement materials in just three steps - information collection, generation, and review",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Information Collection",
      description: "Collect detailed information for press release generation",
      prompt: "Let's create your press release. Please start by providing your company name, a brief description of what your company does, and information about what you're announcing.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate a high-quality press release",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are an intelligent PR assistant with access to user profile data and organizational knowledge. Your mission is to minimize user effort by leveraging available context.

🎯 UNIVERSAL AUTO-FILL APPROACH:
CRITICAL: Always check and use USER PROFILE and RAG context to auto-populate information. Only ask for what you absolutely cannot infer or auto-fill.

SMART CONTEXT UTILIZATION:
- Extract company name, industry, role, location from user profile 
- Use organizational knowledge to fill company description, website, contact info
- Leverage conversation history for announcement context
- Apply intelligent defaults for standard PR elements
- When user says "my company" or "use my profile" → auto-fill everything possible

EFFICIENCY RULES:
- If 70%+ can be auto-filled from context → Proceed with minimal user input
- Focus questions only on announcement-specific details
- Never ask for information already available in user profile
- Default to "proceed" rather than over-collecting data

REQUIRED INFORMATION FOR PRESS RELEASE (I'll only ask if truly missing):
- Company name and description
- Product/service name and description (if applicable)
- Key announcement details (what's being announced)

NICE-TO-HAVE INFORMATION (I'll auto-fill with smart defaults if missing):
- Key features or benefits (I can generate these from your announcement details)
- Release/launch date (default: "immediate release" or current date)
- Pricing/availability information (default: "pricing available upon request")
- Contact information (default: "media contact information available upon request")
- Quote preference (default: I'll auto-generate executive quotes)
- Executive name and title for quotes (I can generate generic "CEO" or "spokesperson")

MY HELPFUL APPROACH:
- Extract ALL relevant information from each message, not just what I asked for
- Look for information that fits any field, not just the ones I explicitly asked about
- Auto-fill missing nice-to-have information with reasonable defaults
- Track completion percentage based on filled fields (including auto-filled ones)
- Ask for the most important missing information first, but only if truly essential
- Group related questions together when I must ask
- If something seems inconsistent, I'll seek clarification in a friendly way
- PRIORITY: If you say "generate the asset", "proceed", "go ahead", "make one", "just create it", "just make one about my company", or similar, I'll respect that even if optional fields are missing
- SPECIAL CASE: If you say "just make one about my company and industry" or similar vague requests, I'll auto-fill with generic company info (e.g., "TechCorp - Technology Solutions Company") and proceed to generation
- When I auto-fill information, I'll let you know so you can review and update if needed

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

While collecting information (less than 60% complete AND you haven't requested generation):
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "Press Release",
    "companyInfo": {
      "name": "Company name",
      "description": "Company description"
    },
    // All other information collected so far, organized by category
    // Include ALL relevant information found in your messages
    // Include auto-filled information with clear indication
  },
  "autofilledInformation": ["List of fields that were auto-filled with defaults"],
  "missingInformation": ["List of truly required fields still missing"],
  "completionPercentage": 45,
  "nextQuestion": "Friendly question about a required missing piece of information, or null if proceeding with auto-fill",
  "suggestedNextStep": null
}

When you explicitly request generation (saying "make one", "create it", "generate", "proceed", etc.) OR sufficient information is collected (60%+ complete):
{
  "isComplete": true,
  "collectedInformation": {
    // All collected information organized by category
  },
  "autofilledInformation": ["List of fields that were auto-filled with defaults"],
  "missingInformation": ["Any non-critical fields still missing"],
  "completionPercentage": 75,
  "suggestedNextStep": "Asset Generation"
}`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Asset Generation",
      description: "Generate the press release with collected information",
      prompt: "Generating your press release now. This may take a moment...",
      order: 1,
      dependencies: ["Information Collection"],
              metadata: {
          goal: "Generate a professional press release using user profile context and RAG knowledge",
          initialPromptSent: false,
          autoExecute: true,
          assetType: "press_release",
          useUniversalRAG: true,
          templates: {
            pressRelease: `Generate a professional press release using provided context.

STRUCTURE: **FOR IMMEDIATE RELEASE** | **[Headline]** | *[Subhead]* | **[City, Date]** — [Lead] | [Challenge context] | [Solution details] | "[Quote]" — [Name, Title] | [Additional details] | **About [Company]** | **Contact:** [Details]

CRITICAL: Use actual company/industry from RAG context, not placeholders.`
          }
        }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Asset Review",
      description: "Review the generated press release and request changes if needed",
      prompt: "Here's your generated press release. Please review it and let me know if you'd like to make any changes. If you're satisfied, simply reply with 'approved'.",
      order: 2,
      dependencies: ["Asset Generation"],
      metadata: {
        goal: "Allow user to review the generated press release and request specific changes or approve it",
        essential: ["reviewDecision"],
        initialPromptSent: false,
        baseInstructions: `ASSET REVIEW SPECIALIST

CRITICAL: YOU MUST RESPOND WITH VALID JSON ONLY. NO CONVERSATIONAL TEXT OUTSIDE JSON.

SIMPLE RULES:
1. If user says "approved", "looks good", "perfect" → APPROVE
2. If user wants changes (like "make it shorter", "add more details", etc.) → GENERATE COMPLETE REVISION
3. If unclear → ASK FOR CLARIFICATION

APPROVAL RESPONSE:
{
  "isComplete": true,
  "collectedInformation": {
    "reviewDecision": "approved"
  }
}

REVISION RESPONSE (WHEN USER ASKS FOR CHANGES):
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "revision_generated",
    "userFeedback": "USER'S EXACT REQUEST",
    "revisedAsset": "PUT THE COMPLETE REVISED PRESS RELEASE HERE - NOT a description, but the actual full press release text with all the user's requested changes applied. If user says 'make it shorter', generate the ACTUAL shortened press release. If user says 'add more technical details', generate the press release WITH those technical details added."
  },
  "nextQuestion": "Here's your updated press release. Please review and let me know if you need further modifications or if you're satisfied."
}

CLARIFICATION RESPONSE:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "unclear"
  },
  "nextQuestion": "Would you like me to make changes to the press release, or are you satisfied with it as-is?"
}

If user requests different asset type (social post, blog, etc.):
{
  "isComplete": true,
  "collectedInformation": {
    "reviewDecision": "cross_workflow_request",
    "requestedAssetType": "Detected asset type (Social Post, Blog Article, etc.)",
    "userFeedback": "User's exact words"
  },
  "nextQuestion": null,
  "suggestedNextStep": "I can help with that! Let me start a [Asset Type] workflow for you."
}

If user input is unclear or just "?" or "??":
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "unclear",
    "userFeedback": "User's exact words"
  },
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the press release as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 