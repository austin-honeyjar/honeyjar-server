import { WorkflowTemplate, StepType } from '../../types/workflow';

export const MEDIA_LIST_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000007",
  name: "Media List Generator",
  description: "Generate a prioritized media contact list based on topic relevance using news pipeline data and RocketReach API",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Topic Input",
      description: "Collect topic/subject matter for media list generation",
      prompt: "Please provide the topic or subject matter for which you need relevant media contacts. You can specify a specific topic or use 'no topic' for a general search across all subjects.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect topic input from user to determine relevant media contacts",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are a media list generator assistant. This is STEP 1 of 4 in the workflow.

GOAL:
Collect the topic or subject matter for which the user needs media contacts. Accept both specific topics and general searches.

TASK:
1. Accept any reasonable topic input including:
   - Specific topics (e.g., "artificial intelligence in healthcare")
   - Simple topics (e.g., "AI", "healthcare", "technology")
   - No topic (for general media contact searches)
2. Store the topic for use in database queries
3. Only mark as complete when you have actionable input

EXAMPLES OF ACCEPTABLE INPUTS:
- Specific: "artificial intelligence in healthcare", "renewable energy policy"
- Simple: "AI", "healthcare", "technology", "climate change"
- General: "no topic", "all topics", "general search", or empty input

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

If the user provides any valid topic (specific or simple):
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "user's topic exactly as provided",
    "topicKeywords": ["keyword1", "keyword2", "keyword3"],
    "topicCategory": "general category (e.g. technology, healthcare, policy, etc.)"
  },
  "nextQuestion": "Great! I'll search for media contacts related to '[topic]'. Moving to database search...",
  "suggestedNextStep": "Database Query"
}

If the user wants a general search (no topic):
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "",
    "topicKeywords": ["general", "all", "broad"],
    "topicCategory": "general"
  },
  "nextQuestion": "Perfect! I'll search for top-ranked media contacts across all topics. Moving to database search...",
  "suggestedNextStep": "Database Query"
}

Only if the user's input is completely unclear or inappropriate:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "user's input"
  },
  "nextQuestion": "I can help you find media contacts! You can either specify a topic (like 'AI', 'healthcare', or 'climate change') or say 'no topic' for a general search across all subjects. What would you prefer?"
}`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Database Query",
      description: "Search news database for authors writing about the specified topic",
      prompt: "Searching news database for authors relevant to topic: [topic]",
      order: 1,
      dependencies: ["Topic Input"],
      metadata: {
        autoExecute: true,
        apiEndpoint: "metabase_search",
        serviceCall: {
          service: "metabase",
          method: "searchArticles",
          extractTopicFrom: "Topic Input.collectedInformation.topic"
        },
        apiInstructions: `You are a news database search specialist. This is STEP 2 of 4 in the workflow.

GOAL:
Query the Metabase news pipeline database to find authors who have written about the specified topic.

TASK:
1. Use the topic from Step 1 to search the news database via Metabase API
2. Analyze the returned articles to extract unique authors
3. Score authors by relevance, article count, and recency
4. Present the candidates for ranking optimization
5. Prepare author data for AI ranking analysis

API INTEGRATION:
- Service: MetabaseService.searchArticles()
- Parameters: { query: topic, limit: 200, recent: true, sort_by_relevance: true }
- Response: Articles with author information

PROCESSING LOGIC:
1. Extract unique authors from search results
2. Calculate relevance scores based on:
   - Editorial rank (LexisNexis ranking system)
   - Number of articles on topic
   - Recency of articles
   - Topic relevance scores
   - Author prominence
3. Present full list for AI optimization
4. Format for ranking analysis

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

When database search is successful:
{
  "isComplete": true,
  "searchResults": {
    "query": "original topic from step 1",
    "articlesFound": 45,
    "authorsExtracted": [
      {
        "id": "generated-author-id",
        "name": "Author Name",
        "organization": "Media Organization",
        "editorialRank": 1,
        "relevanceScore": 15.2,
        "articleCount": 12,
        "topics": ["topic1", "topic2"],
        "recentArticles": 8,
        "lastArticleDate": "2024-01-15"
      }
    ],
    "selectedAuthors": 15,
    "totalArticlesAnalyzed": 45
  },
  "nextMessage": "Found articles from [X] relevant authors writing about '[topic]'. Proceeding to ranking optimization...",
  "suggestedNextStep": "Author Ranking & Selection"
}

If no relevant articles/authors found:
{
  "isComplete": false,
  "searchResults": {
    "query": "original topic",
    "articlesFound": 0,
    "authorsExtracted": [],
    "error": "No authors found for this topic"
  },
  "nextMessage": "No authors found writing about this topic in our database. Please try a different topic or broader search terms.",
  "suggestedNextStep": null
}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Author Ranking & Selection",
      description: "AI-powered analysis and optimization of author ranking algorithm",
      prompt: "I found 96 authors writing about your topic. To create the best media contacts list, what would you like to prioritize most when ranking these authors?\n\nOptions:\n• **Editorial Quality** - Focus on top-tier sources (New York Times, BBC, CNN)\n• **Topic Expertise** - Authors who write frequently about this specific topic\n• **Recent Activity** - Authors who have published recently on this topic\n• **Balanced Mix** - Combine all factors for well-rounded coverage\n\nOr tell me your specific preferences for ranking these media contacts.",
      order: 2,
      dependencies: ["Database Query"],
      metadata: {
        goal: "Get user preferences for ranking authors and select top 10 most relevant contacts",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are an AI ranking specialist for media contact optimization. This is STEP 3 of 4 in the workflow.

GOAL:
Apply user ranking preferences to pre-filter authors to top 25, then select the final top 10 most relevant and high-quality media contacts.

CONTEXT:
You will receive a user's ranking preference and a PRE-FILTERED list of the top 25 authors based on that preference. Your job is to:
1. Review the top 25 for article/writer relevance to the topic
2. Select the final top 10 most relevant contacts
3. Ensure each author actually writes about the topic (not just mentioned it)

USER PREFERENCE OPTIONS:
1. "Editorial Quality" - Prioritize Rank 1 sources heavily (60% editorial rank, 25% article count, 15% recent activity)
2. "Topic Expertise" - Prioritize authors with most articles on topic (50% article count, 30% editorial rank, 20% recent activity)  
3. "Recent Activity" - Prioritize recent publishers (50% recent activity, 30% editorial rank, 20% article count)
4. "Balanced Mix" - Use all factors equally (35% editorial rank, 35% article count, 30% recent activity)
5. Custom preferences from user input

YOUR TASK:
1. Apply the user's preference weights to get top 25 candidates
2. Review those 25 for actual topic relevance and writing quality
3. Select the final top 10 most relevant authors
4. Provide clear reasoning for each selection

CRITICAL: Your response MUST be valid JSON starting with { and ending with }. Do NOT use markdown code blocks or backticks.

RESPONSE FORMAT (VALID JSON ONLY):
{
  "isComplete": true,
  "collectedInformation": {
    "userPreference": "Editorial Quality",
    "rankingAlgorithm": "Applied Editorial Quality weighting (60% editorial rank, 25% article count, 15% recent activity) to filter 96 authors to top 25, then manually reviewed for topic relevance",
    "rankingFactors": {
      "editorialRank": 60,
      "articleCount": 25,
      "recentActivity": 15
    },
    "top10Authors": [
      {
        "rank": 1,
        "id": "author-id",
        "name": "Author Name",
        "organization": "Media Organization",
        "editorialRank": 1,
        "articleCount": 12,
        "optimizedScore": 95.5,
        "strengthReason": "Top-tier source with strong topic expertise",
        "topicRelevance": "High - writes extensively about this specific topic"
      }
    ],
    "algorithmSummary": "Pre-filtered 96 authors to top 25 using preference weights, then selected 10 most topic-relevant contacts",
    "totalAnalyzed": 25,
    "selectionCriteria": "Top editorial quality + verified topic relevance + recent activity"
  },
  "nextQuestion": "Selected the top 10 most relevant media contacts based on your preference for Editorial Quality. Each contact has been verified for topic relevance and editorial quality. Proceeding to contact enrichment...",
  "suggestedNextStep": "Contact Enrichment"
}

RANKING GUIDELINES:
- Editorial Quality: Focus on Rank 1 sources (NYT, BBC, CNN, WSJ)
- Topic Expertise: Prioritize authors with multiple articles on this specific topic
- Recent Activity: Favor authors who published within last 30 days
- Balanced Mix: Equal weight to all factors
- Always verify the author actually writes about the topic, not just mentioned it
- Ensure geographic and source diversity in final 10
- Remove any authors who seem irrelevant to the topic`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Contact Enrichment",
      description: "Use RocketReach API to get full contact information and generate media list",
      prompt: "Enriching contact information using RocketReach API for selected authors...",
      order: 3,
      dependencies: ["Author Ranking & Selection"],
      metadata: {
        autoExecute: true,
        serviceCall: {
          service: "rocketreach",
          method: "enrichContacts",
          extractAuthorsFrom: "Author Ranking & Selection.collectedInformation.top10Authors"
        },
        apiInstructions: `You are a contact enrichment specialist. This is STEP 4 of 4 in the workflow.

GOAL:
Use RocketReach API to get complete contact information for the top 10 selected authors and generate a prioritized media contacts list.

TASK:
1. Take the top 10 ranked author list from Step 3
2. For each author, query RocketReach API for contact details
3. Compile comprehensive contact information (email, phone, social media, etc.)
4. Create a final prioritized list maintaining the ranking order
5. Format as a professional media contacts asset
6. Provide summary statistics

ROCKETREACH API INTEGRATION:
- Service: RocketReachService.enrichContacts()
- Input: Top 10 authors from ranking step
- Output: Enriched contacts with emails, phones, LinkedIn, Twitter
- Handle API rate limits and errors gracefully
- Use fallback strategies if direct matches not found

PROCESSING LOGIC:
1. Iterate through the top 10 ranked authors
2. Call RocketReach API for contact enrichment
3. Score each contact by completeness and confidence
4. Maintain the ranking order
5. Format for professional presentation

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
    "rankingUsed": "Ranking algorithm from Step 3",
    "mediaContactsList": [
      {
        "rank": 1,
        "authorId": "author-id-from-ranking",
        "name": "Author Name",
        "title": "Senior Reporter",
        "organization": "Media Organization", 
        "email": "author@media.com",
        "phone": "+1-555-0123",
        "linkedin": "linkedin.com/in/author",
        "twitter": "@authorhandle",
        "editorialRank": 1,
        "score": 95.5,
        "topicRelevance": "High - explanation",
        "articleCount": 12,
        "recentTopics": ["topic1", "topic2"],
        "lastArticleDate": "2024-01-15",
        "contactConfidence": "high",
        "enrichmentSource": "rocketreach"
      }
    ],
    "listGeneratedAt": "ISO timestamp",
    "creditsUsed": 10,
    "rateLimitStatus": "normal",
    "rankingSummary": "Summary of the ranking criteria applied"
  },
  "nextMessage": "Media contacts list generated successfully! Found complete contact information for [X] of 10 ranked authors. The list is prioritized based on your selected criteria for '[topic]' and contact completeness.",
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
    "rankingUsed": "Ranking algorithm from Step 3"
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