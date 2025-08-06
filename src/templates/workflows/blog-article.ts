import { WorkflowTemplate, StepType } from "../../types/workflow";

export const BLOG_ARTICLE_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000011",
  name: "Blog Article",
  description: "Create long-form POVs, news, or narratives in just three steps - information collection, generation, and review",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Information Collection",
      description: "Collect detailed information for blog article generation",
      prompt: "Let's create your blog article. What topic or announcement would you like to write about?",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate a compelling blog article",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `EFFICIENT BLOG ARTICLE INFORMATION COLLECTOR

CORE LOGIC:
1. AUTO-POPULATE everything possible from user profile and context
2. Only ask questions for truly missing essential information
3. Generate immediately if user requests it, even with missing optional info

REQUIRED INFORMATION (only ask if missing):
- What topic do you want to write about? (the blog subject/announcement)

AUTO-FILL FROM CONTEXT:
- Company name (from user profile: Honeyjar)
- Company description (from user profile: PR Tech industry)
- Target audience (default: industry professionals)
- Tone (default: professional and engaging)
- Article goal (default: thought leadership)

USER INTENT DETECTION:
- If user says "generate", "make one", "create it", "proceed" → Complete immediately
- If user provides topic details → Auto-fill everything else and complete
- Only ask follow-up questions if the topic is unclear

RESPONSE FORMAT: JSON only, no conversational text.

Auto-fill completion:
{
  "isComplete": true,
  "collectedInformation": {
    "assetType": "Blog Article",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    },
    "topic": "User provided topic",
    "targetAudience": "industry professionals and decision makers",
    "tone": "professional and engaging",
    "goals": "thought leadership and education"
  },
  "autofilledInformation": ["company name", "company description", "target audience", "tone", "article goals"],
  "completionPercentage": 60,
  "suggestedNextStep": "Asset Generation"
}

If topic unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "Blog Article",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    }
  },
  "autofilledInformation": ["company name", "company description"],
  "completionPercentage": 30,
  "nextQuestion": "What topic would you like to write about?",
  "suggestedNextStep": null
}`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Asset Generation",
      description: "Generate the blog article with collected information",
      prompt: "Generating your blog article now. This may take a moment...",
      order: 1,
      dependencies: ["Information Collection"],
      metadata: {
        goal: "Generate professional blog article using user profile context and RAG knowledge",
        initialPromptSent: false,
        autoExecute: true,
        assetType: "blog_article",
        useUniversalRAG: true,
        templates: {
          blogPost: `Generate a compelling blog article using provided context.

STRUCTURE: **Headline:** [SEO-friendly title] | **Introduction:** [Story hook] | **Body:** [Narrative-driven content with quotes] | **Conclusion:** [Call to action]

CRITICAL: Use actual company/industry from RAG context, not placeholders. Focus on storytelling over credentials.`
        }
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Asset Review",
      description: "Review the generated blog article and request changes if needed",
      prompt: "Here's your generated blog article. Please review it and let me know if you'd like to make any changes. If you're satisfied, simply reply with 'approved'.",
      order: 2,
      dependencies: ["Asset Generation"],
      metadata: {
        goal: "Allow user to review the generated blog article and request specific changes or approve it",
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
    "revisedAsset": "PUT THE COMPLETE REVISED BLOG ARTICLE HERE - NOT a description, but the actual full blog article text with all the user's requested changes applied. If user says 'make it shorter', generate the ACTUAL shortened blog article. If user says 'add more technical details', generate the blog article WITH those technical details added."
  },
  "nextQuestion": "Here's your updated blog article. Please review and let me know if you need further modifications or if you're satisfied."
}

CLARIFICATION RESPONSE:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "unclear"
  },
  "nextQuestion": "Would you like me to make changes to the blog article, or are you satisfied with it as-is?"
}

If user requests different asset type (press release, social post, etc.):
{
  "isComplete": true,
  "collectedInformation": {
    "reviewDecision": "cross_workflow_request",
    "requestedAssetType": "Detected asset type (Press Release, Social Post, etc.)",
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
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the blog article as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 