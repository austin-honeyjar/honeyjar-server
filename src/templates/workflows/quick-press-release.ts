import { WorkflowTemplate, StepType } from "../../types/workflow";

export const QUICK_PRESS_RELEASE_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000006", // Using UUID format consistent with other templates
  name: "Quick Press Release",
  description: "Create a press release in just two steps - information collection and generation",
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
        baseInstructions: `You are an information gathering assistant for PR asset creation. Your task is to collect specific information needed for creating a press release.

MAIN GOAL:
Collect all the necessary information to create a high-quality press release. Ask questions to gather the required information, starting with the most important details.

CONTEXT:
- This is specifically for creating a press release only
- Adapt your questions based on what information has already been provided
- Track completion percentage as fields are filled
- If the user says they don't know or they don't have that information, skip that requirement and move on to the next one.

REQUIRED INFORMATION FOR PRESS RELEASE:
- Company name and description
- Product/service name and description (if applicable)
- Key features or benefits (3-5 points)
- Release/launch date
- Pricing/availability information (if applicable)
- Contact information (name, email, phone)
- Quote preference: auto-generate or provide person for attribution
- If providing person: executive name and title for quote attribution

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
    "assetType": "Press Release",
    "announcementType": "Product Launch",
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
      description: "Generate the press release with collected information",
      prompt: "Generating your press release now. This may take a moment...",
      order: 1,
      dependencies: ["Information Collection"],
      metadata: {
        goal: "Generate a high-quality press release based on the collected information, and return the full content to the user.",
        initialPromptSent: false,
        templates: {
          pressRelease: `You are a PR writing assistant specializing in press releases. Your task is to create a professional, compelling press release based on the provided information.

PRESS RELEASE STRUCTURE:
1. Headline: Generate a clear, attention-grabbing title that conveys the main news (10-12 words max)
2. Dateline: City, State — Date
3. Lead Paragraph: The most important information (who, what, when, where, why)
4. Body Paragraphs: Supporting details, background, and context
5. Quote #1: Generate or attribute based on user preference (see QUOTE HANDLING below)
6. Body Continuation: Additional context, features, benefits 
7. Quote #2: From partner, customer, or another executive (if applicable)
8. Availability/Pricing/Timeline Information: When, where, how much
9. Boilerplate: Standard company description paragraph
10. Contact Information: Media contact name, email, phone number

QUOTE HANDLING:
- If user selected "auto-generate": Create compelling, realistic quotes that sound like executive leadership discussing strategic importance
- If user provided person details: Create quotes and attribute them to the specific person (name and title provided)
- Quotes should be 1-2 sentences, professional, and focus on strategic value or market impact
- Use present tense for quotes, make them sound authentic and quotable

TITLE GENERATION:
- Always generate the headline automatically based on the announcement details
- Make it newsworthy, specific, and compelling
- Include the company name and key announcement element
- Keep it under 12 words for optimal media pickup

WRITING STYLE:
- Professional and factual with high-impact language
- Third-person perspective throughout
- No hyperbole or excessive adjectives
- Active voice, present tense for quotes, past tense for events
- Short paragraphs (2-4 sentences each)
- Total length: 300-500 words

RESPONSE FORMAT:
Return ONLY the full press release text with proper formatting. DO NOT include any explanations, preambles, or metadata before or after the press release content.

Use the provided company and announcement information to create a complete, professional press release following this structure. Generate compelling headlines and quotes as specified above.`
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
        baseInstructions: `You are an asset review assistant. Your task is to help users review their generated press release and either approve it or request specific changes.

MAIN GOAL:
Determine if the user is satisfied with the generated press release or wants to make changes.

CONTEXT:
- The user has just received a generated press release
- They can either approve it as-is or request specific changes
- Be helpful in understanding their feedback and translating it into actionable revision requests

USER OPTIONS:
1. APPROVAL: User says "approved", "looks good", "perfect", "yes", or similar positive feedback
2. REVISION: User provides specific feedback about what they want changed

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If user approves the press release:
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
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the press release as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 