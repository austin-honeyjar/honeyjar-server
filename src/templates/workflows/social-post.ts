import { WorkflowTemplate, StepType } from "../../types/workflow";

export const SOCIAL_POST_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000010",
  name: "Social Post",
  description: "Craft social copy in your brand voice in just three steps - information collection, generation, and review",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Information Collection",
      description: "Collect detailed information for social post generation",
      prompt: "Let's create your social post. What announcement would you like to make?",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate engaging social media content",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `EFFICIENT SOCIAL POST INFORMATION COLLECTOR

CORE LOGIC:
1. AUTO-POPULATE everything possible from user profile and context
2. Only ask questions for truly missing essential information
3. Generate immediately if user requests it, even with missing optional info

REQUIRED INFORMATION (only ask if missing):
- What are you announcing? (the news/message for social media)

AUTO-FILL FROM CONTEXT:
- Company name (from user profile: Honeyjar)
- Company description (from user profile: PR Tech industry)
- Target platforms (default: LinkedIn and Twitter)
- Hashtags (auto-generate from industry)
- Call to action (auto-generate)

USER INTENT DETECTION:
- If user says "generate", "make one", "create it", "proceed" → Complete immediately
- If user provides announcement details → Auto-fill everything else and complete
- Only ask follow-up questions if the announcement is unclear

RESPONSE FORMAT: JSON only, no conversational text.

Auto-fill completion (when sufficient info provided):
{
  "isComplete": true,
  "collectedInformation": {
    "assetType": "Social Post",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    },
    "announcementDetails": "User provided announcement",
    "targetPlatforms": ["LinkedIn", "Twitter"],
    "hashtags": "#PRTech #Honeyjar",
    "callToAction": "Learn more"
  },
  "autofilledInformation": ["company name", "company description", "target platforms", "hashtags", "call to action"],
  "completionPercentage": 60,
  "nextQuestion": null,
  "suggestedNextStep": "Asset Generation"
}

If announcement unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "Social Post",
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
      description: "Generate the social post with collected information",
      prompt: "Generating your social media content now. This may take a moment...",
      order: 1,
      dependencies: ["Information Collection"],
      metadata: {
        goal: "Generate professional social media content using user profile context and RAG knowledge",
        initialPromptSent: false,
        autoExecute: true,
        assetType: "social_post",
        useUniversalRAG: true,
        templates: {
          socialPost: `You are a social media content creator specializing in announcement posts. Your task is to create engaging social media content based on the provided information.

CRITICAL CONTENT GUIDELINES:
- BE SPECIFIC - avoid vague generalizations and broad statements throughout all content
- For hiring announcements: Explain specifically how this person's leadership will impact the way PR professionals work
- AVOID hyperbolic language - use measured, professional excitement
- Focus on concrete benefits and specific outcomes rather than general enthusiasm

DELIVERABLES:
Create TWO separate, platform-optimized social media posts:

1. LinkedIn Post (300-400 words)
   - Professional, detailed tone with storytelling elements
   - Include relevant background and context
   - Use 3-5 strategic hashtags
   - Include a clear call to action
   - Professional formatting with line breaks for readability
   - Detail impact on industry professionals' daily work
   
2. Twitter/X Post (250-280 characters)
   - Concise, high-impact language
   - Include 2-3 relevant hashtags
   - Engaging hook or call to action
   - Optimized for maximum engagement
   - Avoid broad generalizations and hyperbolic claims

CONTENT GUIDELINES:
- Lead with the announcement using measured excitement
- Highlight the most compelling benefits or features with SPECIFIC details
- Connect the announcement to concrete value for the audience
- Include specific achievements, data, or unique aspects when available
- End with forward-looking statement about specific impact
- Use engaging, professional language that builds appropriate excitement
- Include relevant industry hashtags
- Make it shareable and engaging
- For leadership announcements: Detail specifically how their expertise will change workflows, processes, or outcomes for PR professionals
- Avoid hyperbolic claims - focus on realistic, measurable impact
- Be specific about what changes, improvements, or benefits people can expect

FORMATTING REQUIREMENTS:
- LinkedIn post should have natural paragraph breaks
- Use emojis sparingly and professionally
- Each post should stand alone as complete content
- No meta-commentary or explanatory text outside the posts
- Focus on specificity over broad statements
- Ensure all claims are concrete and verifiable

RESPONSE FORMAT:
Return the social media posts directly as plain text, not as JSON:

**LinkedIn Post:**

[Your complete LinkedIn post content here]

**Twitter/X Post:**

[Your complete Twitter post content here]

IMPORTANT: Return ONLY the social media posts themselves, with no additional commentary, instructions, or explanatory text. Do not wrap in JSON. The content should be ready to copy and paste directly to social platforms.`
        }
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Asset Review",
      description: "Review the generated social post and request changes if needed",
      prompt: "Here's your generated social media content. Please review it and let me know if you'd like to make any changes. If you're satisfied, simply reply with 'approved'.",
      order: 2,
      dependencies: ["Asset Generation"],
      metadata: {
        goal: "Allow user to review the generated social media content and request specific changes or approve it",
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
    "revisedAsset": "PUT THE COMPLETE REVISED SOCIAL MEDIA CONTENT HERE - NOT a description, but the actual full social media posts with all the user's requested changes applied. If user says 'make it shorter', generate the ACTUAL shortened posts. If user says 'add more technical details', generate the posts WITH those technical details added."
  },
  "nextQuestion": "Here's your updated social media content. Please review and let me know if you need further modifications or if you're satisfied."
}

CLARIFICATION RESPONSE:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "unclear"
  },
  "nextQuestion": "Would you like me to make changes to the social media content, or are you satisfied with it as-is?"
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
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the social media content as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 