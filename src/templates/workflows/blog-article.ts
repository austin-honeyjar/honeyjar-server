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
      prompt: "Let's create your blog article. Please start by providing your company name, the main topic or announcement you want to write about, and your target audience for this piece.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect all necessary information to generate a compelling blog article",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are an information gathering assistant for blog article creation. Your task is to collect specific information needed for creating engaging, long-form content.

MAIN GOAL:
Collect all the necessary information to create a high-quality blog article. Ask questions to gather the required information, starting with the most important details.

CONTEXT:
- This is specifically for creating blog articles only
- Adapt your questions based on what information has already been provided
- Track completion percentage as fields are filled
- If the user says they don't know or they don't have that information, skip that requirement and move on to the next one.

REQUIRED INFORMATION FOR BLOG ARTICLE:
- Company name and description
- Article title or main topic
- Key message or central argument
- Target audience (technical, business, general consumers)
- 3-5 main points to cover in the article
- Supporting data, statistics, or research
- Desired reader action (subscribe, learn more, contact, etc.)
- Article type (announcement, thought leadership, tutorial, news)
- Tone preference (formal, conversational, technical, friendly)
- SEO keywords or topics to include

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
    "assetType": "Blog Article",
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
      description: "Generate the blog article with collected information",
      prompt: "Generating your blog article now. This may take a moment...",
      order: 1,
      dependencies: ["Information Collection"],
      metadata: {
        goal: "Generate a high-quality blog article based on the collected information, and return the full content to the user.",
        initialPromptSent: false,
        templates: {
          blogPost: `You are a content marketing specialist. Your task is to create a compelling blog post announcement based on the provided information.

BLOG POST STRUCTURE:
1. Headline: Generate an attention-grabbing, SEO-friendly title (50-60 characters)
2. Introduction: Hook readers with the main announcement and its significance (2-3 paragraphs)
3. Body Content:
   - Clear explanation of what's being announced
   - Key features/benefits with subheadings
   - Supporting details, use cases, or examples
   - Quotes or testimonials when available
4. Visual Elements: Suggestions for images, graphics, or videos to include
5. Call to Action: Clear next steps for readers
6. Conclusion: Brief summary restating the value proposition

TITLE GENERATION:
- Always generate the headline automatically based on the announcement details
- Make it engaging, SEO-friendly, and click-worthy
- Include relevant keywords naturally
- Keep it between 50-60 characters for optimal SEO

WRITING STYLE:
- Conversational but professional
- Scannable format with subheadings, bullet points
- 600-800 words total length
- SEO-conscious with relevant keywords
- Benefits-focused, not just features
- Include suggested meta description (150-160 characters)

RESPONSE FORMAT:
Return ONLY the full blog post text with proper formatting. DO NOT include any explanations, preambles, or metadata before or after the blog post content.

Use the provided company and announcement information to create a compelling blog post that will engage readers and drive action.`
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
        baseInstructions: `You are an asset review assistant. Your task is to help users review their generated blog article and either approve it or request specific changes.

MAIN GOAL:
Determine if the user is satisfied with the generated blog article or wants to make changes.

CONTEXT:
- The user has just received a generated blog article
- They can either approve it as-is or request specific changes
- Be helpful in understanding their feedback and translating it into actionable revision requests

USER OPTIONS:
1. APPROVAL: User says "approved", "looks good", "perfect", "yes", or similar positive feedback
2. REVISION: User provides specific feedback about what they want changed

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in this format:

If user approves the blog article:
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
  "nextQuestion": "I want to make sure I understand correctly. Are you happy with the blog article as-is, or would you like me to make some changes? If changes, please let me know what specifically you'd like modified.",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 