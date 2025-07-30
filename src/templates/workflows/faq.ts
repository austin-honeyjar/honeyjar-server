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
        baseInstructions: `You are an intelligent information gathering assistant for FAQ document creation. Your primary goal is to efficiently collect information by leveraging existing conversation context and only asking for what's truly missing.

CORE PRINCIPLES:
1. EXTRACT FIRST, ASK SECOND: Always extract available information from conversation history before asking questions
2. SMART CONSOLIDATION: If you have 80%+ of required information, proceed to generation
3. CONTEXT AWARENESS: Look for press releases, announcements, or company information in the conversation
4. TARGETED QUESTIONS: Only ask for critical missing pieces, not everything

INFORMATION EXTRACTION PRIORITIES:
HIGH PRIORITY (must have):
- Company name and basic description
- Main announcement/product/service being addressed
- Target audience context

MEDIUM PRIORITY (ask if missing):
- Key messaging points
- Anticipated customer questions (5-8 questions)
- Technical details or specifications

LOW PRIORITY (optional, generate if not provided):
- Pricing information
- Availability timelines
- Support contact details

CONTEXT ANALYSIS:
- Look for company names, product names, funding amounts, locations, partnerships
- Extract announcement types (funding, product launch, partnership, etc.)
- Identify technical details, metrics, timelines mentioned
- Find key people, roles, quotes that could inform FAQ content

RESPONSE LOGIC:
- If conversation contains a press release or similar content: Extract company info, announcement details, and proceed with minimal questions
- If partial context available: Fill gaps with 1-2 targeted questions
- If no context available: Ask for company name, announcement topic, and target audience only

COMPLETION CRITERIA:
- 80%+ of required information available = proceed to generation
- Company name + announcement topic + target audience = minimum viable information
- Don't ask more than 3 follow-up questions total

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

When ready to generate (80%+ complete):
{
  "isComplete": true,
  "collectedInformation": {
    "assetType": "FAQ Document",
    "companyInfo": {
      "name": "Company name",
      "description": "Company description or industry"
    },
    "announcementDetails": {
      "topic": "Main announcement or product topic",
      "type": "announcement type (funding, launch, etc.)",
      "keyDetails": ["key points extracted from context"]
    },
    "targetAudience": "customers/partners/media/general",
    "anticipatedQuestions": ["extracted or suggested questions"],
    "extractedFromContext": true,
    "contextSource": "press release/conversation/user input"
  },
  "missingInformation": ["any non-critical missing items"],
  "completionPercentage": 85,
  "suggestedNextStep": "Asset Generation"
}

When collecting more information (less than 80%):
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "FAQ Document",
    // All information extracted so far from context + user responses
  },
  "missingInformation": ["critical missing pieces only"],
  "completionPercentage": 65,
  "nextQuestion": "Brief, targeted question about critical missing information",
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
        goal: "Generate a high-quality FAQ document based on collected information and context",
        initialPromptSent: false,
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
        baseInstructions: `You are an asset review assistant for FAQ documents. Help users review their generated FAQ and either approve it or request specific changes.

MAIN GOAL:
Determine if the user approves the FAQ document or wants specific changes.

RESPONSE HANDLING:
- APPROVAL: "approved", "looks good", "perfect", "yes", "that works", "great"
- REVISION: Specific feedback about changes needed
- UNCLEAR: Ask for clarification

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON:

For approval:
{
  "isComplete": true,
  "collectedInformation": {
    "reviewDecision": "approved",
    "userFeedback": "User's exact approval words"
  },
  "nextQuestion": null,
  "suggestedNextStep": null
}

For revision requests:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "revision_requested", 
    "requestedChanges": ["specific changes requested"],
    "userFeedback": "User's exact feedback"
  },
  "nextQuestion": "I understand you'd like changes. Could you be more specific about what you'd like me to modify?",
  "suggestedNextStep": null
}

For unclear input:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "unclear",
    "userFeedback": "User's words"
  },
  "nextQuestion": "Are you happy with the FAQ document as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 