import { WorkflowTemplate, StepType } from '../../types/workflow';

export const MEDIA_MATCHING_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000006",
  name: "Media Matching",
  description: "Generate a prioritized media contact list based on topic relevance using news pipeline data and RocketReach API",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Topic Input",
      description: "Collect topic/subject matter for media matching analysis",
      prompt: "Let's create your media list. What topic or industry should I focus on for finding relevant media contacts?",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect topic input to generate targeted media contacts",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `EFFICIENT MEDIA LIST TOPIC COLLECTOR

CORE LOGIC:
1. Accept any clear topic for media list generation
2. Auto-generate keywords and context from topic
3. Complete immediately when topic is provided
4. Only ask for clarification if truly unclear

USER INTENT DETECTION:
- If user provides a topic (e.g., "robotics", "AI healthcare", "fintech") → Complete immediately
- If user says "generate", "create media list", "proceed" → Ask for topic
- Only ask follow-up if topic is genuinely unclear

RESPONSE FORMAT: JSON only, no conversational text.

When sufficient topic provided:
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "user's topic exactly as provided",
    "topicKeywords": ["auto-generated", "keywords", "from topic"],
    "topicCategory": "auto-detected category",
    "searchContext": "context for AI author generation"
  },
  "autofilledInformation": ["keywords", "category", "search context"],
  "completionPercentage": 80,
  "nextQuestion": null,
  "suggestedNextStep": "AI Author Generation"
}

If topic unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "user's input"
  },
  "autofilledInformation": [],
  "completionPercentage": 20,
  "nextQuestion": "What topic or industry should I focus on? (e.g., 'robotics', 'healthcare AI', 'fintech')",
  "suggestedNextStep": null
}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "AI Author Generation",
      description: "Use AI to suggest a list of relevant authors (names only) who typically write about the specified topic",
      prompt: "Using AI to identify author names who typically write about: [topic]",
      order: 1,
      dependencies: ["Topic Input"],
      metadata: {
        goal: "Generate relevant authors using AI based on topic expertise",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        autoExecute: false, // Disabled auto-execute to prevent infinite loop
        assetType: "author_list",
        useUniversalRAG: true,
        baseInstructions: `Generate 10 potential journalists who write about the provided topic. This is STEP 2 of 5 in the workflow.

GOAL:
Use AI to identify authors who typically write about the specified topic.

TASK:
1. Generate 10 real journalist names who write about this topic
2. Focus on quality over quantity
3. Score each author's topic relevance
4. Keep response simple and fast

REQUIREMENTS:
- 10 REAL journalist names from major publications (e.g., Reuters, TechCrunch, Wired, IEEE Spectrum, Wall Street Journal, etc.)
- Use actual names of real journalists who cover this topic
- Industry/trade publications prioritized for niche topics  
- One author per publication (no duplicates)
- Score recent topic relevance 1-10 for each author
- Simple JSON structure for fast processing

IMPORTANT: Generate REAL names of actual journalists, not fake placeholder names like "Tech Journalist 1" or "Science Writer 3". Use names like "Kristen Korosec", "Brian Heater", "John Markoff", etc.

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this SIMPLIFIED structure:

{
  "isComplete": true,
  "collectedInformation": {
    "topic": "the topic",
    "totalSuggestions": 10,
    "suggestedAuthors": [
      {
        "name": "Real Author Name",
        "organization": "Publication Name",
        "expertise": "specific area",
        "relevanceScore": 8
      }
    ]
  },
  "nextQuestion": "Perfect! I've generated 10 potential journalists who write about this topic. Now I'll search for their recent articles.",
  "suggestedNextStep": "Metabase Article Search"
}`
    }
  },
    {
      type: StepType.API_CALL,
      name: "Metabase Article Search",
      description: "Search Metabase database for recent articles written by each AI-suggested author",
      prompt: "Searching news database for recent articles by AI-suggested authors...",
      order: 2,
      dependencies: ["AI Author Generation"],
      metadata: {
        autoExecute: true, // Auto-execute after AI Author Generation completes
        apiEndpoint: "metabase_author_search",
        securityLevel: "confidential", // Mark as confidential - exclude from conversation history and RAG
        excludeFromHistory: true, // Exclude from conversation history
        excludeFromRAG: true, // Exclude from RAG context pulls
        securityTags: ["database_search", "article_data", "sensitive_content"],
        serviceCall: {
          service: "metabase",
          method: "searchArticlesByAuthors",
          extractAuthorsFrom: "AI Author Generation.authorSuggestions.suggestedAuthors"
        }
      }
    },
    {
      type: StepType.API_CALL,
      name: "Article Analysis & Ranking",
      description: "Algorithmic analysis and ranking of 20 potential authors, filtering down to top 10 with actual relevant recent articles using metadata scoring",
      prompt: "Analyzing articles from 20 potential authors and filtering to top 10 with highest relevance scores...",
      order: 3,
      dependencies: ["Metabase Article Search"],
      metadata: {
        autoExecute: true, // Auto-execute after Metabase search completes
        algorithmicAnalysis: true, // Flag to indicate this is algorithmic, not AI
        serviceCall: {
          service: "metabase",
          method: "algorithmicArticleAnalysis",
          extractDataFrom: "Metabase Article Search.searchResults"
        },
        scoringCriteria: {
          editorialRank: {
            weight: 25,
            scoring: "Rank 1=100, Rank 2=80, Rank 3=60, Rank 4=40, Rank 5+=20"
          },
          topicRelevance: {
            weight: 35,
            scoring: "IndexTerms matching + Semantic entities + Topic array + Company mentions"
          },
          articleRecency: {
            weight: 20,
            scoring: "Articles within 30 days get bonus, weighted by recency"
          },
          sourceQuality: {
            weight: 20,
            scoring: "Based on source metadata and publication type"
          }
        },
        languageFiltering: {
          enabled: true,
          allowedLanguages: ["en", "eng", "english"],
          filterFields: ["language", "languageCode", "source.primaryLanguage"]
        }
      }
    },
    {
      type: StepType.API_CALL,
      name: "Contact Enrichment",
      description: "Use RocketReach API to get full contact information for the top-ranked authors",
      prompt: "Enriching contact information using RocketReach API for top-ranked authors...",
      order: 4,
      dependencies: ["Article Analysis & Ranking"],
      metadata: {
        autoExecute: true,
        assetType: "media_contacts_list",
        useUniversalRAG: true,
        serviceCall: {
          service: "rocketreach",
          method: "enrichContacts",
          extractAuthorsFrom: "Article Analysis & Ranking.collectedInformation.top10Authors"
        },
        templates: {
          contactEnrichment: `Generate a comprehensive media contacts list using RocketReach API enrichment.

STRUCTURE: For each author, include complete contact information, relevance analysis, and recent article context.

CRITICAL: Maintain ranking order and provide actionable contact insights.`
        },
        apiInstructions: `You are a contact enrichment specialist. This is STEP 5 of 5 in the workflow.

GOAL:
Use RocketReach API to get complete contact information for the top-ranked authors from the media matching analysis and generate a prioritized media contacts list.

TASK:
1. Take the top 10 ranked author list from Step 4
2. For each author, query RocketReach API for contact details
3. Compile comprehensive contact information (email, phone, social media, etc.)
4. Create a final prioritized list maintaining the ranking order based on article relevance
5. Format as a professional media contacts asset
6. Provide summary statistics

ROCKETREACH API INTEGRATION:
- Service: RocketReachService.enrichContacts()
- Input: Top 10 authors from analysis step
- Output: Enriched contacts with emails, phones, LinkedIn, Twitter
- Handle API rate limits and errors gracefully
- Use fallback strategies if direct matches not found

PROCESSING LOGIC:
1. Iterate through the top 10 ranked authors from media matching analysis
2. Call RocketReach API for contact enrichment
3. Score each contact by completeness and confidence
4. Maintain the ranking order based on article relevance and recency
5. For each author, include their top 3 most relevant articles with titles, summaries, and relevance scores
6. Provide a 2-sentence analysis insight explaining why this author is valuable based on their expertise and coverage quality
7. Format for professional presentation with comprehensive article context

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

When contact enrichment is successful:
{
  "isComplete": true,
  "enrichmentResults": {
    "topic": "original topic",
    "totalAuthorsProcessed": 10,
    "contactsEnriched": 8,
    "enrichmentSuccessRate": "80%",
    "rankingUsed": "Article relevance and recent coverage ranking",
    "mediaContactsList": [
      {
        "rank": 1,
        "authorId": "author-id-from-analysis",
        "name": "Author Name",
        "title": "Senior Reporter",
        "organization": "Media Organization", 
        "email": "author@media.com",
        "phone": "+1-555-0123",
        "linkedin": "linkedin.com/in/author",
        "twitter": "@authorhandle",
        "recentRelevantArticles": 6,
        "averageRelevanceScore": 78.5,
        "topicRelevance": "High - explanation",
        "articleCount": 8,
        "recentTopics": ["topic1", "topic2"],
        "top3RelevantArticles": [
          {
            "title": "Article title",
            "summary": "Article summary",
            "relevanceScore": 85,
            "publishedAt": "2024-01-15",
            "url": "article-url"
          }
        ],
        "contactConfidence": "high",
        "enrichmentSource": "rocketreach",
        "analysisInsight": "Two-sentence explanation of why this author is a valuable contact based on their demonstrated expertise, coverage quality, and relevance to the topic. This should highlight their specific strengths and why they would be interested in and qualified to cover this story."
      }
    ],
    "listGeneratedAt": "ISO timestamp",
    "creditsUsed": 10,
    "rateLimitStatus": "normal",
    "rankingSummary": "Contacts ranked by recent article relevance and topic coverage depth"
  },
  "nextMessage": "Media matching contacts list generated successfully! Found complete contact information for [X] of 10 top-ranked authors writing about '[topic]'. The list is prioritized based on their recent coverage relevance and article count. These contacts have been validated with actual recent articles on your topic.",
  "suggestedNextStep": null
}

If enrichment has issues:
{
  "isComplete": false,
  "enrichmentResults": {
    "topic": "original topic",
    "totalAuthorsProcessed": 10,
    "contactsEnriched": 6,
    "enrichmentSuccessRate": "60%",
    "partialResults": "array of partial results",
    "apiErrors": ["RocketReach rate limit", "Contact not found for Author X"],
    "creditsUsed": 6,
    "rankingUsed": "Article relevance and recent coverage ranking"
  },
  "nextMessage": "Encountered some issues during contact enrichment. Successfully found [X] of 10 contacts. Would you like to proceed with partial results or retry the failed lookups?",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 