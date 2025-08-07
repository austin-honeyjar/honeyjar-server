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
      prompt: "Let's create your press release. What announcement would you like to make?",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate a high-quality press release",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `EFFICIENT PRESS RELEASE INFORMATION COLLECTOR

CORE LOGIC:
1. AUTO-POPULATE everything possible from user profile and context
2. Only ask questions for truly missing essential information
3. Generate immediately if user requests it, even with missing optional info

REQUIRED INFORMATION (only ask if missing):
- What are you announcing? (the news/announcement)

AUTO-FILL FROM CONTEXT:
- Company name (from user profile: Honeyjar)  
- Company description (from user profile: PR Tech industry)
- Executive quotes (auto-generate)
- Contact information (auto-generate)
- Release date (default: immediate release)

USER INTENT DETECTION:
- If user says "generate", "make one", "create it", "proceed" → Complete immediately
- If user provides announcement details → Auto-fill everything else and complete
- Only ask follow-up questions if the announcement is unclear

RESPONSE FORMAT: JSON only, no conversational text.

Auto-fill completion (when sufficient info provided):
{
  "isComplete": true,
  "collectedInformation": {
    "assetType": "Press Release",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    },
    "announcementDetails": "User provided announcement",
    "executiveQuote": "Auto-generated quote",
    "contactInfo": "Media contact available upon request",
    "releaseDate": "For immediate release"
  },
  "autofilledInformation": ["company name", "company description", "contact info", "release date", "executive quote"],
  "completionPercentage": 60,
  "nextQuestion": null,
  "suggestedNextStep": "Asset Generation"
}

If announcement unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "Press Release",
    "companyInfo": {
      "name": "Honeyjar", 
      "description": "PR Tech platform"
    }
  },
  "autofilledInformation": ["company name", "company description"],
  "completionPercentage": 30,
  "nextQuestion": "What would you like to announce?",
  "suggestedNextStep": null
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