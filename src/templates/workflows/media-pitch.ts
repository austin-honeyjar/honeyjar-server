import { WorkflowTemplate, StepType } from "../../types/workflow";

export const MEDIA_PITCH_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000009",
  name: "Media Pitch",
  description: "Build custom outreach with context in just three steps - information collection, generation, and review",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Information Collection",
      description: "Collect detailed information for media pitch generation",
      prompt: "Let's create your media pitch. Please start by telling me: What are we pitching today? Also, is this an exclusive offer to one reporter or a general pitch to multiple outlets?",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate a compelling media pitch",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `EFFICIENT MEDIA PITCH INFORMATION COLLECTOR

CORE LOGIC:
1. AUTO-POPULATE everything possible from user profile and context
2. Only ask questions for truly missing essential information
3. Generate immediately if user requests it, even with missing optional info

REQUIRED INFORMATION (only ask if missing):
- What are you pitching? (the news/announcement)
- Is this exclusive to one reporter or general to multiple outlets?

AUTO-FILL FROM CONTEXT:
- Company name (from user profile: Honeyjar)
- Company description (from user profile: PR Tech industry)
- Spokesperson (default: CEO or company spokesperson)
- Contact info (auto-generate)
- Timeline (default: immediate release)

USER INTENT DETECTION:
- If user says "generate", "make one", "create it", "proceed" → Complete immediately
- If user provides news + strategy → Auto-fill everything else and complete
- Only ask follow-up questions if news or strategy unclear

RESPONSE FORMAT: JSON only, no conversational text.

Auto-fill completion:
{
  "isComplete": true,
  "collectedInformation": {
    "assetType": "Media Pitch",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    },
    "newsAnnouncement": "User provided news",
    "pitchStrategy": "exclusive OR general",
    "spokesperson": "CEO/Company spokesperson",
    "contactInfo": "Media contact available upon request",
    "timeline": "immediate release"
  },
  "autofilledInformation": ["company name", "company description", "spokesperson", "contact info", "timeline"],
  "completionPercentage": 60,
  "suggestedNextStep": "Asset Generation"
}

If news or strategy unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "Media Pitch",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    }
  },
  "autofilledInformation": ["company name", "company description"],
  "completionPercentage": 25,
  "nextQuestion": "What are you pitching and is this exclusive to one reporter or general to multiple outlets?",
  "suggestedNextStep": null
}`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Asset Generation",
      description: "Generate the media pitch with collected information",
      prompt: "Generating your media pitch now. This may take a moment...",
      order: 1,
      dependencies: ["Information Collection"],
      metadata: {
        goal: "Generate professional media pitch using user profile context and RAG knowledge",
        initialPromptSent: false,
        autoExecute: true,
        assetType: "media_pitch",
        useUniversalRAG: true,
        templates: {
          mediaPitch: `You are a media relations specialist. Your task is to create a compelling, personalized media pitch based on the provided information.

CRITICAL: ADAPT TONE AND CTA BASED ON PITCH STRATEGY
- For EXCLUSIVE pitches: Use more personalized, urgent language with exclusive-specific CTAs
- For GENERAL pitches: Use broader, inclusive language with general-interest CTAs
- AVOID hyperbolic language - use measured, professional tone
- Focus on current PR industry challenges and how the announcement represents tech disruption to streamline workflows
- Never use outward-facing labels or section headers in the final pitch

MEDIA PITCH STRUCTURE:
1. Subject Line: Compelling, newsworthy headline (50-60 characters)
   - NO subjects/categories or labels in subject lines
2. Opening: Personal greeting and immediate value proposition
3. News Details: Clear, concise explanation of the announcement
   - Connect to broader reader relevance OR focus on "new hire" and "industry moves" coverage angles
   - Avoid narrow scope - emphasize broader industry impact
4. Newsworthiness: Why this matters now and to their audience
   - Emphasize industry disruption and workflow streamlining
   - Connect to broader trends affecting their readers
5. Supporting Elements: Key data, quotes, or unique angles
6. Resources Available: What you can provide
   - For bigger national story announcements: offer interviews with executives
   - Provide bio links for reference when available
   - DO NOT offer images upfront (these are follow-up questions only)
7. Call to Action: Strategy-specific closing that encourages response
   - Never call it a "pitch" - use "would this be of interest?" approach
   - Avoid "eagerly waiting" or overly enthusiastic language

STRATEGY-SPECIFIC CALL TO ACTION:
For EXCLUSIVE pitches, use language like:
- "I'm coming to you first with the details."
- "I'd like to offer you the exclusive on this launch."
- "Let me know by [XX date] if you'd like to move forward — happy to connect you with the company and share more details."

For GENERAL pitches, use language like:
- "Wanted to keep you in the loop on this news."
- "Let me know if you're interested in covering."
- "Let me know if you're interested in an interview or need anything else to help shape the story."
- "Would this be of interest for your coverage?"

CONTENT GUIDELINES:
- Lead with the most compelling news angle
- Keep it concise but informative (200-300 words)
- Include specific, quantifiable details when available
- Highlight exclusive access or unique story angles
- Make it easy for journalists to see the story potential
- Avoid industry jargon and overly promotional language
- Include clear next steps and contact information
- Focus on industry challenges and tech disruption rather than general excitement
- Connect to broader industry trends and reader interests

FORMATTING REQUIREMENTS:
- No outward-facing section labels or headers in the final pitch
- Natural paragraph flow without artificial divisions
- Professional email format
- Clear, scannable structure
- No metadata or explanatory text outside the pitch
- No subjects/categories in the communication

RESPONSE FORMAT:
Return ONLY the complete media pitch text with proper formatting. DO NOT include any explanations, preambles, section labels, or metadata before or after the pitch content.

Use the provided company information and pitch strategy to create a compelling media pitch that will get journalists interested and encourage them to respond.`
        }
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Asset Review",
      description: "Review the generated media pitch and request changes if needed",
      prompt: "Here's your generated media pitch. Please review it and let me know if you'd like to make any changes. If you're satisfied, simply reply with 'approved'.",
      order: 2,
      dependencies: ["Asset Generation"],
      metadata: {
        goal: "Allow user to review the generated media pitch and request specific changes or approve it",
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
    "revisedAsset": "PUT THE COMPLETE REVISED MEDIA PITCH HERE - NOT a description, but the actual full media pitch text with all the user's requested changes applied. If user says 'make it shorter', generate the ACTUAL shortened media pitch. If user says 'add more technical details', generate the media pitch WITH those technical details added."
  },
  "nextQuestion": "Here's your updated media pitch. Please review and let me know if you need further modifications or if you're satisfied."
}

CLARIFICATION RESPONSE:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "unclear"
  },
  "nextQuestion": "Would you like me to make changes to the media pitch, or are you satisfied with it as-is?"
}

If user requests different asset type (press release, blog, etc.):
{
  "isComplete": true,
  "collectedInformation": {
    "reviewDecision": "cross_workflow_request",
    "requestedAssetType": "Detected asset type (Press Release, Blog Article, etc.)",
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
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the media pitch as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 