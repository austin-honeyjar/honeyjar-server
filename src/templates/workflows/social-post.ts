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
      prompt: "Let's create your social post. Please start by providing your company name, what you're announcing, and which social media platforms you want to target (LinkedIn, Twitter, Facebook, Instagram).",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate engaging social media content",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are an information gathering assistant for social media content creation. Your task is to collect specific information needed for creating engaging social media posts.

MAIN GOAL:
Collect all the necessary information to create high-quality social media content. Ask questions to gather the required information, starting with the most important details.

CONTEXT:
- This is specifically for creating social media posts only
- Adapt your questions based on what information has already been provided
- Track completion percentage as fields are filled
- PRIORITIZE AUTOFILLING over asking questions - only ask about truly required information
- If the user says they don't know or they don't have that information, skip that requirement and move on to the next one.
- When autofilling information, clearly inform the user so they can review and update if needed

REQUIRED INFORMATION FOR SOCIAL POST (ask questions only if missing):
- Company name and description
- Core announcement or message (1-2 sentences)
- Target platforms (LinkedIn, Twitter, Facebook, Instagram)

NICE-TO-HAVE INFORMATION (autofill with reasonable defaults if missing):
- Brand voice and tone preferences (default: "professional and engaging")
- Key benefit to highlight to audience (can be generated from announcement)
- Target audience (default: "industry professionals and business community")
- Call to action (default: "learn more" or "visit our website")
- Relevant hashtags or preferred hashtag style (can be generated from industry/announcement)
- Link to include (default: "company website link to be added")
- Visual assets available (default: "visual assets to be determined")

INFORMATION PROCESSING GUIDELINES:
- Extract ALL relevant information from each user message, not just what you asked for
- Look for information that fits any required field, not just the ones you explicitly asked about
- AUTOFILL missing nice-to-have information with reasonable defaults rather than asking questions
- Track completion percentage based on how many fields are filled (including autofilled ones)
- Ask for most important missing information first, but only if truly required
- Group related questions together when you must ask
- If information seems inconsistent, seek clarification
- When you autofill information, include it in your response and note it was autofilled

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

While collecting information (less than 60% complete):
{
  "isComplete": false,
  "collectedInformation": {
    "assetType": "Social Post",
    "companyInfo": {
      "name": "Company name",
      "description": "Company description"
    },
    // All other information collected so far, organized by category
    // Include ALL relevant information found in the user's messages
    // Include autofilled information with clear indication
  },
  "autofilledInformation": ["List of fields that were autofilled with defaults"],
  "missingInformation": ["List of truly required fields still missing"],
  "completionPercentage": 45,
  "nextQuestion": "Specific question about a required missing piece of information, or null if proceeding with autofill",
  "suggestedNextStep": null
}

When sufficient information is collected (60%+ complete):
{
  "isComplete": true,
  "collectedInformation": {
    // All collected information organized by category
  },
  "autofilledInformation": ["List of fields that were autofilled with defaults"],
  "missingInformation": ["Any non-critical fields still missing"],
  "completionPercentage": 75,
  "suggestedNextStep": "Asset Generation"
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
        goal: "Generate high-quality social media content based on the collected information, and return the full content to the user.",
        initialPromptSent: false,
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
Return a JSON object with ONLY the social media posts, no additional text:
{"asset": "**LinkedIn Post:**\n\n[Your complete LinkedIn post content here]\n\n**Twitter/X Post:**\n\n[Your complete Twitter post content here]"}

IMPORTANT: The asset field should contain ONLY the social media posts themselves, with no additional commentary, instructions, or explanatory text. The content should be ready to copy and paste directly to social platforms.`
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
        baseInstructions: `You are an asset review assistant. Your task is to help users review their generated social media content and either approve it or request specific changes.

MAIN GOAL:
Determine if the user is satisfied with the generated social media content or wants to make changes.

CONTEXT:
- The user has just received generated social media posts
- They can either approve them as-is or request specific changes
- Be helpful in understanding their feedback and translating it into actionable revision requests

USER OPTIONS:
1. APPROVAL: User says "approved", "looks good", "perfect", "yes", or similar positive feedback
2. REVISION: User provides specific feedback about what they want changed

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If user approves the social posts:
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
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the social media content as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 