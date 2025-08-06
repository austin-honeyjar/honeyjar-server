import { WorkflowTemplate, StepType } from "../../types/workflow";

export const FAQ_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000012",
  name: "FAQ",
  description: "Create comprehensive FAQ documents with intelligent context extraction",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Information Collection",
      description: "Intelligently collect and organize information for FAQ generation",
      prompt: "Let's create your FAQ document. I'll analyze any existing context and gather the information needed.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Efficiently collect information for FAQ generation using conversation history and context",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `EFFICIENT FAQ INFORMATION COLLECTOR

CORE LOGIC:
1. AUTO-POPULATE everything possible from user profile and context
2. Only ask questions for truly missing essential information
3. Generate immediately if user requests it, even with missing optional info

REQUIRED INFORMATION (only ask if missing):
- What announcement/product/service do you need an FAQ for?

AUTO-FILL FROM CONTEXT:
- Company name (from user profile: Honeyjar)
- Company description (from user profile: PR Tech industry)
- Target audience (default: customers and partners)
- FAQ questions (auto-generate 8-12 relevant questions)
- Support contact (auto-generate)

USER INTENT DETECTION:
- If user says "generate", "make one", "create it", "proceed" → Complete immediately
- If user provides announcement details → Auto-fill everything else and complete
- Only ask follow-up questions if the announcement is unclear

RESPONSE FORMAT: JSON only, no conversational text.

Auto-fill completion:
{
  "isComplete": true,
  "collectedInformation": {
    "assetType": "FAQ Document",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    },
    "announcementDetails": "User provided announcement",
    "targetAudience": "customers and partners",
    "anticipatedQuestions": ["Auto-generated relevant questions"],
    "supportContact": "Support contact information available upon request"
  },
  "autofilledInformation": ["company name", "company description", "target audience", "questions", "support contact"],
  "completionPercentage": 60,
  "suggestedNextStep": "Asset Generation"
}

If announcement unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "FAQ Document",
    "companyInfo": {
      "name": "Honeyjar",
      "description": "PR Tech platform"
    }
  },
  "autofilledInformation": ["company name", "company description"],
  "completionPercentage": 30,
  "nextQuestion": "What announcement/product/service do you need an FAQ for?",
  "suggestedNextStep": null
}`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Asset Generation",
      description: "Generate a comprehensive FAQ document with collected information",
      prompt: "Generating your FAQ document now...",
      order: 1,
      dependencies: ["Information Collection"],
      metadata: {
        goal: "Generate professional FAQ document using user profile context and RAG knowledge",
        initialPromptSent: false,
        autoExecute: true,
        assetType: "faq_document",
        useUniversalRAG: true,
        templates: {
          faqDocument: `You are a communications specialist creating a comprehensive FAQ document. Use the provided information and any conversation context to create relevant, helpful questions and answers.

FAQ DOCUMENT STRUCTURE:
1. Introduction: Brief explanation of the announcement/topic (1-2 sentences)
2. 8-12 Frequently Asked Questions organized in logical sections:
   - Basic Information (What/When/Where questions)
   - Features & Benefits 
   - Technical & Implementation
   - Business & Availability
   - Support & Contact

QUESTION DEVELOPMENT:
- Create questions customers would actually ask
- Include questions about timeline, pricing, availability if relevant
- Address potential concerns or objections
- Cover both basic and detailed information needs

ANSWER GUIDELINES:
- Comprehensive but concise (2-4 sentences per answer)
- Include specific details from the context (dates, numbers, names)
- Maintain professional but approachable tone
- Reference company capabilities and track record when relevant

CONTEXT UTILIZATION:
- Use specific company information, funding amounts, locations, partnerships
- Reference metrics, timelines, and technical details mentioned
- Include relevant quotes or key messaging points
- Ensure consistency with any press release or announcement content

RESPONSE FORMAT:
Return ONLY the complete FAQ document with proper formatting. No explanations or metadata.

Structure as:
[Company Name] [Topic] - Frequently Asked Questions

[Brief introduction paragraph]

**General Information**
Q: [Question]
A: [Answer]

**[Category Name]**
Q: [Question]  
A: [Answer]

[Continue with all questions organized by category]`
        }
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Asset Review",
      description: "Review the generated FAQ document and request changes if needed",
      prompt: "Here's your generated FAQ document. Please review it and let me know if you'd like any changes, or simply reply 'approved' if you're satisfied.",
      order: 2,
      dependencies: ["Asset Generation"],
      metadata: {
        goal: "Allow user to review the FAQ document and request specific changes or approve it",
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
    "revisedAsset": "PUT THE COMPLETE REVISED FAQ DOCUMENT HERE - NOT a description, but the actual full FAQ document text with all the user's requested changes applied. If user says 'make it shorter', generate the ACTUAL shortened FAQ. If user says 'add more technical details', generate the FAQ WITH those technical details added."
  },
  "nextQuestion": "Here's your updated FAQ document. Please review and let me know if you need further modifications or if you're satisfied."
}

CLARIFICATION RESPONSE:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "unclear"
  },
  "nextQuestion": "Would you like me to make changes to the FAQ document, or are you satisfied with it as-is?"
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
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the FAQ document as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 