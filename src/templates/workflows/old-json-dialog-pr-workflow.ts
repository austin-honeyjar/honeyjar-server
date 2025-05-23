import { StepType } from "../../types/workflow";

export const JSON_DIALOG_PR_WORKFLOW_TEMPLATE = {
  name: "JSON Dialog PR Workflow",
  description: "An intelligent PR workflow using AI-driven JSON dialog for information collection",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Information Collection",
      description: "Collect PR information using AI-driven questions",
      prompt: "I'll help you create PR assets by asking relevant questions. What type of announcement are you working on? (Product Launch, Funding Round, Partnership, Company Milestone, Executive Hire, or Industry Award)",
      dependencies: [],
      metadata: {
        minInteractions: 4, // Minimum number of interactions before completion can be considered
        baseInstructions: `You are a PR information collection assistant. Your goal is to extract PR information through a structured conversation.

TASK:
1. Extract PR-related information from the user's input
2. Update the collectedInformation object with new data
3. Determine what information is still missing
4. Ask for specific missing information in the nextQuestion
5. Only mark isComplete as true when you have sufficient information for generating a PR asset

PR INFORMATION REQUIREMENTS:
- Announcement Type (Product Launch, Funding Round, Partnership, Company Milestone, Executive Hire, or Industry Award)
- Company Information (name, description, website, industry, founding date, size, location)
- Announcement Details (title, main message, timing, significance)
- Product Information (for Product Launch - name, features, benefits, pricing, availability)
- Key People (spokesperson name, title, quote)
- Market Context (target audience, competitors, market position)
- Timeline (launch date, important milestones)
- Call to Action (what you want audience to do)

COLLECTION REQUIREMENTS BY ANNOUNCEMENT TYPE:
Product Launch:
- Essential: Product name, features, benefits, pricing, availability, target audience, spokesperson quote
- Important: Unique selling points, market context, call to action

Funding Round:
- Essential: Investment amount, investors, funding round (A, B, etc.), company valuation, use of funds
- Important: Previous funding, business model, growth metrics

Partnership:
- Essential: Partner name, partnership details, strategic benefits, joint offerings, spokesperson quotes from both parties
- Important: Partnership timeline, market impact

Company Milestone:
- Essential: Milestone details, significance, growth metrics, historical context
- Important: Future plans, industry context

Executive Hire:
- Essential: Executive name, title, background, experience, responsibilities, executive quote
- Important: Company growth context, transition details

Industry Award:
- Essential: Award name, awarding organization, category, significance, spokesperson quote
- Important: Selection criteria, competition, previous recognitions`,
        collectedInformation: {
          announcementType: null,
          companyInfo: {
            name: null,
            description: null,
            website: null,
            industry: null,
            foundingDate: null,
            size: null,
            location: null
          },
          announcementDetails: {
            title: null, 
            mainMessage: null,
            timing: null,
            significance: null
          },
          productInfo: {
            name: null,
            description: null,
            features: null,
            benefits: null,
            pricing: null,
            availability: null,
            uniqueSellingPoints: null
          },
          keyPeople: {
            spokesperson: null,
            title: null,
            quote: null,
            backgroundInfo: null
          },
          marketContext: {
            targetAudience: null,
            competitors: null,
            marketPosition: null,
            industryTrends: null
          },
          timeline: {
            launchDate: null,
            embargoDetails: null,
            importantMilestones: null
          },
          callToAction: null
        }
      }
    },
    {
      type: StepType.API_CALL,
      name: "Asset Generation",
      description: "Generate PR assets based on collected information",
      prompt: "Based on the information collected, I can now generate your [ASSET_TYPE]. This may take a moment...",
      dependencies: ["Information Collection"],
      metadata: {
        templates: {
          pressRelease: `You are a PR writing assistant specializing in press releases. Your task is to create a professional, compelling press release based on the provided information.

PRESS RELEASE STRUCTURE:
1. Headline: Clear, attention-grabbing title that conveys the main news (10-12 words max)
2. Dateline: City, State — Date
3. Lead Paragraph: The most important information (who, what, when, where, why)
4. Body Paragraphs: Supporting details, background, and context
5. Quote #1: From company leadership about strategic importance
6. Body Continuation: Additional context, features, benefits 
7. Quote #2: From partner, customer, or another executive (if applicable)
8. Availability/Pricing/Timeline Information: When, where, how much
9. Boilerplate: Standard company description paragraph
10. Contact Information: Media contact name, email, phone number

WRITING STYLE:
- Professional and factual with high-impact language
- Third-person perspective throughout
- No hyperbole or excessive adjectives
- Active voice, present tense for quotes, past tense for events
- Short paragraphs (2-4 sentences each)
- Total length: 300-500 words

RESPONSE FORMAT:
Return a JSON object with the completed press release as value to the key "asset":
{"asset": "YOUR FULL PRESS RELEASE TEXT HERE WITH ALL FORMATTING"}`,
          mediaPitch: `You are a PR writing assistant specializing in media pitches. Your task is to create a personalized, compelling media pitch based on the provided information.

MEDIA PITCH STRUCTURE:
1. Subject Line: Attention-grabbing, specific to the news (40-60 characters)
2. Greeting: Personal to the recipient
3. Introduction: Brief intro to you, your company, and why you're reaching out
4. News Hook: Clear statement of the announcement and why it matters NOW
5. Relevance Paragraph: Why this news matters to THIS specific journalist and their audience
6. Key Details: 3-4 bullet points highlighting the most newsworthy elements
7. Request: Clear ask for coverage, interview, or other specific action
8. Call to Action: How and when to respond, what materials are available
9. Signature: Your name, title, contact details

WRITING STYLE:
- Conversational but professional
- Personalized to the recipient (avoid generic language)
- Concise and scannable (300 words maximum)
- Value-focused (emphasize "why care?" throughout)
- No attachments mention (those go separately)
- Clear deadline or timing information

RESPONSE FORMAT:
Return a JSON object with the completed media pitch as value to the key "asset":
{"asset": "YOUR FULL MEDIA PITCH TEXT HERE WITH ALL FORMATTING"}`,
          socialPost: `You are a social media content creator specializing in announcement posts. Your task is to create engaging social media content based on the provided information.

DELIVERABLES:
1. LinkedIn Post (1300-1600 characters)
   - Professional tone, detail-oriented
   - Include hashtags, tag relevant partners
   - Clear call to action
   
2. Twitter/X Post (220-280 characters)
   - Concise, high-impact language
   - 1-2 relevant hashtags
   - Engaging question or call to action
   
3. Facebook/Instagram Post (800-1000 characters)
   - Conversational, engaging tone
   - Visual description suggestion
   - Clear call to action
   - 3-5 relevant hashtags

WRITING STYLE:
- Authentic to brand voice
- Clear announcement of the news
- Emphasis on benefits/impact, not just features
- Conversational without being unprofessional

RESPONSE FORMAT:
Return a JSON object with all social posts as values in a nested object:
{"asset": {
  "linkedin": "LINKEDIN POST TEXT",
  "twitter": "TWITTER/X POST TEXT",
  "facebook": "FACEBOOK/INSTAGRAM POST TEXT"
}}`,
          blogPost: `You are a content specialist creating a blog post for a company announcement. Your task is to craft an informative, engaging blog post that delivers key information while building brand authority.

BLOG POST STRUCTURE:
1. Headline: Attention-grabbing, SEO-friendly title (60-70 characters)
2. Introduction: Hook readers, introduce topic, hint at value (2-3 paragraphs)
3. Main Announcement: Present the news clearly and concisely
4. Context/Background: Explain why this matters to the reader
5. Details: Expand on features, benefits, or implications
6. Quotes: Include quotes from leadership or stakeholders
7. Supporting Information: Data, examples, or use cases 
8. Future Implications: What this means for customers or industry
9. Conclusion: Summarize key points and restate value
10. Call to Action: Clear next steps for readers

WRITING STYLE:
- Authoritative but conversational
- Educational and informative
- Scannable with clear headings and short paragraphs
- SEO-optimized with relevant keywords
- 800-1200 words in length
- Balanced between promotional and educational content

RESPONSE FORMAT:
Return a JSON object with the completed blog post as value to the key "asset":
{"asset": "YOUR FULL BLOG POST TEXT HERE WITH PROPER FORMATTING"}`
        },
        openai_instructions: `You are a PR asset generation assistant. Your task is to create a high-quality PR asset based on the collected information.

TASK:
1. Review all information collected from the user
2. Generate a professional, polished asset that matches the specific format and style guidelines
3. Format your response as valid JSON

RESPONSE FORMAT:
Return ONLY a JSON object with the completed asset as the value for the "asset" key:
{"asset": "YOUR FULL ASSET TEXT HERE WITH ALL FORMATTING"}

For social posts, use a nested object:
{"asset": {
  "linkedin": "LINKEDIN POST TEXT",
  "twitter": "TWITTER/X POST TEXT", 
  "facebook": "FACEBOOK/INSTAGRAM POST TEXT"
}}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Asset Review",
      description: "Review and revise generated assets based on user feedback",
      prompt: "Here's your [ASSET_TYPE]. Please review it and let me know if you'd like to make any changes. If you're satisfied, simply reply with 'approved'.",
      dependencies: ["Asset Generation"],
      metadata: {
        baseInstructions: `You are a PR asset review assistant. Your task is to analyze the user's feedback on the generated asset and determine if they want to make changes or approve it.

TASK:
1. Analyze the user's feedback on the generated asset
2. Determine if they are approving the asset or requesting changes
3. If requesting changes, identify what specific changes they want
4. Return a structured JSON response with your analysis

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON in one of these formats:

If the user approves the asset:
{
  "isComplete": true,
  "collectedInformation": {
    "feedbackType": "approval",
    "feedback": "User approved the asset"
  },
  "nextQuestion": null,
  "suggestedNextStep": "Workflow Completion"
}

If the user wants revisions:
{
  "isComplete": false,
  "collectedInformation": {
    "feedbackType": "revision",
    "requestedChanges": [
      "Make the headline more attention-grabbing",
      "Add more specific details about the product features",
      "Make the tone more formal"
    ],
    "originalFeedback": "User's original feedback text here"
  },
  "nextQuestion": "I'll revise your asset with these changes. Is there anything specific you want me to focus on while making these revisions?",
  "suggestedNextStep": null
}

If the feedback is unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "feedbackType": "unclear",
    "feedback": "User's unclear feedback"
  },
  "nextQuestion": "Could you please specify what changes you'd like me to make to the asset?",
  "suggestedNextStep": null
}

IMPORTANT:
- Focus on determining if the user is approving the asset or requesting changes
- For approvals, look for words like "approved", "good", "looks great", "perfect", etc.
- For revisions, identify the specific changes requested
- If the feedback is unclear, ask for clarification`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 