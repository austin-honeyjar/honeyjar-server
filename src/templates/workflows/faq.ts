import { WorkflowTemplate, StepType } from "../../types/workflow";

export const FAQ_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000012",
  name: "FAQ",
  description: "Create frequent questions and suggested responses in just three steps - information collection, generation, and review",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Information Collection",
      description: "Collect detailed information for FAQ document generation",
      prompt: "Let's create your FAQ document. Please start by providing your company name, the product or service you're creating FAQs for, and the main announcement or topic these FAQs should address.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate a comprehensive FAQ document",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are an information gathering assistant for FAQ document creation. Your task is to collect specific information needed for creating comprehensive FAQ documents.

MAIN GOAL:
Collect all the necessary information to create a high-quality FAQ document. Ask questions to gather the required information, starting with the most important details.

CONTEXT:
- This is specifically for creating FAQ documents only
- Adapt your questions based on what information has already been provided
- Track completion percentage as fields are filled
- If the user says they don't know or they don't have that information, skip that requirement and move on to the next one.

REQUIRED INFORMATION FOR FAQ DOCUMENT:
- Company name and description
- Product/service name being addressed
- Main announcement or topic for the FAQs
- Target audience (customers, partners, media, investors)
- Key messaging points to reinforce
- 5-8 anticipated questions customers might ask
- Technical details or specifications (if applicable)
- Pricing information (if relevant)
- Availability or timeline details
- Support contact information

INFORMATION PROCESSING GUIDELINES:
- Extract ALL relevant information from each user message, not just what you asked for
- Look for information that fits any required field, not just the ones you explicitly asked about
- Track completion percentage based on how many required fields are filled
- Ask for most important missing information first
- Group related questions together
- If information seems inconsistent, seek clarification

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

While collecting information (less than 90% complete):
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "FAQ Document",
    "companyInfo": {
      "name": "Company name",
      "description": "Company description"
    },
    // All other information collected so far, organized by category
    // Include ALL relevant information found in the user's messages
  },
  "missingInformation": ["List of important fields still missing"],
  "completionPercentage": 65,
  "nextQuestion": "Specific question about an important missing piece of information",
  "suggestedNextStep": null
}

When sufficient information is collected (90%+ complete):
{
  "isComplete": true,
  "collectedInformation": {
    // All collected information organized by category
  },
  "missingInformation": ["Any non-critical fields still missing"],
  "completionPercentage": 95,
  "suggestedNextStep": "Asset Generation"
}`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Asset Generation",
      description: "Generate the FAQ document with collected information",
      prompt: "Generating your FAQ document now. This may take a moment...",
      order: 1,
      dependencies: ["Information Collection"],
      metadata: {
        goal: "Generate a high-quality FAQ document based on the collected information, and return the full content to the user.",
        initialPromptSent: false,
        templates: {
          faqDocument: `You are a communications specialist. Your task is to create a comprehensive FAQ document for the announcement based on the provided information.

FAQ DOCUMENT STRUCTURE:
1. Introduction: Brief explanation of the announcement/product (1 paragraph)
2. 8-12 Frequently Asked Questions, organized in logical sections:
   - Basic questions (what, when, where)
   - Feature/benefit questions
   - Technical/implementation questions
   - Pricing/availability questions
   - Support/service questions
3. Each question should have:
   - Clear, direct question phrasing
   - Comprehensive but concise answer (2-5 sentences)
   - Any relevant links or resources mentioned

WRITING STYLE:
- Clear, straightforward language
- Anticipate real customer questions
- Balance marketing messaging with practical information
- Consistent formatting throughout
- Avoid technical jargon unless explaining technical concepts

RESPONSE FORMAT:
Return ONLY the full FAQ document text with proper formatting. DO NOT include any explanations, preambles, or metadata before or after the FAQ content.

Use the provided company and announcement information to create a comprehensive FAQ document that addresses common questions and concerns.`
        }
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Asset Review",
      description: "Review the generated FAQ document and request changes if needed",
      prompt: "Here's your generated FAQ document. Please review it and let me know if you'd like to make any changes. If you're satisfied, simply reply with 'approved'.",
      order: 2,
      dependencies: ["Asset Generation"],
      metadata: {
        goal: "Allow user to review the generated FAQ document and request specific changes or approve it",
        essential: ["reviewDecision"],
        initialPromptSent: false,
        baseInstructions: `You are an asset review assistant. Your task is to help users review their generated FAQ document and either approve it or request specific changes.

MAIN GOAL:
Determine if the user is satisfied with the generated FAQ document or wants to make changes.

CONTEXT:
- The user has just received a generated FAQ document
- They can either approve it as-is or request specific changes
- Be helpful in understanding their feedback and translating it into actionable revision requests

USER OPTIONS:
1. APPROVAL: User says "approved", "looks good", "perfect", "yes", or similar positive feedback
2. REVISION: User provides specific feedback about what they want changed

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If user approves the FAQ document:
{
  "isComplete": true,
  "collectedInformation": {
    "reviewDecision": "approved",
    "userFeedback": "User's exact words of approval"
  },
  "nextQuestion": null,
  "suggestedNextStep": null
}

If user requests changes:
{
  "isComplete": false,
  "collectedInformation": {
    "reviewDecision": "revision_requested",
    "requestedChanges": ["List of specific changes the user wants"],
    "userFeedback": "User's exact feedback"
  },
  "nextQuestion": "I understand you'd like some changes. Could you be more specific about what you'd like me to modify?",
  "suggestedNextStep": null
}

If user input is unclear:
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