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
      prompt: "Please provide the topic or subject matter for which you need relevant media contacts.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect topic input from user to determine relevant media contacts",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are a media list generator assistant. This is STEP 1 of 3 in the workflow.

GOAL:
Collect the specific topic or subject matter for which the user needs media contacts.

TASK:
1. Ask the user to provide a clear topic/subject matter (e.g., "climate change", "artificial intelligence", "healthcare policy", etc.)
2. Validate that the topic is specific enough to generate relevant results
3. Store the topic for use in database queries
4. Only mark as complete when you have a clear, actionable topic

EXAMPLES OF GOOD TOPICS:
- "artificial intelligence in healthcare"
- "renewable energy policy"
- "cybersecurity threats"
- "climate change legislation"
- "biotechnology innovations"

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

If the user provides a clear topic:
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

If the user's input is too vague or unclear:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "user's input"
  },
  "nextQuestion": "Please provide a more specific topic. For example: 'artificial intelligence in healthcare', 'renewable energy policy', or 'cybersecurity threats'. What specific subject matter do you need media contacts for?"
}`
      }
    },
    {
      type: StepType.API_CALL,
      name: "Database Query",
      description: "Query news pipeline database for relevant authors using Metabase API",
      prompt: "Searching news database for authors relevant to topic: [topic]",
      order: 1,
      dependencies: ["Topic Input"],
      metadata: {
        autoExecute: true,
        serviceCall: {
          service: "metabase",
          method: "searchArticles",
          extractTopicFrom: "Topic Input.collectedInformation.topic"
        },
        apiInstructions: `You are a news database search specialist. This is STEP 2 of 3 in the workflow.

GOAL:
Query the Metabase news pipeline database to find authors who have written about the specified topic.

TASK:
1. Use the topic from Step 1 to search the news database via Metabase API
2. Analyze the returned articles to extract unique authors
3. Score authors by relevance, article count, and recency
4. Present the top candidates for contact enrichment
5. Prepare author data for RocketReach API lookup

API INTEGRATION:
- Service: MetabaseService.searchArticles()
- Parameters: { query: topic, limit: 200, recent: true, sort_by_relevance: true }
- Response: Articles with author information

PROCESSING LOGIC:
1. Extract unique authors from search results
2. Calculate relevance scores based on:
   - Number of articles on topic
   - Recency of articles
   - Topic relevance scores
   - Author prominence
3. Filter to top 3 most relevant authors
4. Format for RocketReach enrichment

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
  "nextMessage": "Found articles from [X] relevant authors writing about '[topic]'. Proceeding to contact enrichment via RocketReach...",
  "suggestedNextStep": "Contact Enrichment"
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
      type: StepType.API_CALL,
      name: "Contact Enrichment",
      description: "Use RocketReach API to get full contact information and generate media list",
      prompt: "Enriching contact information using RocketReach API for selected authors...",
      order: 2,
      dependencies: ["Database Query"],
      metadata: {
        autoExecute: true,
        serviceCall: {
          service: "rocketreach",
          method: "enrichContacts",
          extractAuthorsFrom: "Database Query.searchResults.authorsExtracted"
        },
        apiInstructions: `You are a contact enrichment specialist. This is STEP 3 of 3 in the workflow.

GOAL:
Use RocketReach API to get complete contact information for selected authors and generate a prioritized media contacts list.

TASK:
1. Take the author list from Step 2 database search
2. For each author, query RocketReach API for contact details
3. Compile comprehensive contact information (email, phone, social media, etc.)
4. Create a prioritized list ordered by relevance score and contact completeness
5. Format as a professional media contacts asset
6. Provide summary statistics and export options

ROCKETREACH API INTEGRATION:
- Service: RocketReachService.enrichContacts()
- Input: Array of authors from database search
- Output: Enriched contacts with emails, phones, LinkedIn, Twitter
- Handle API rate limits and errors gracefully
- Use fallback strategies if direct matches not found

PROCESSING LOGIC:
1. Iterate through each author from database search
2. Call RocketReach API for contact enrichment
3. Score each contact by completeness and confidence
4. Prioritize by: relevance score + contact completeness
5. Format for professional presentation

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

When contact enrichment is successful:
{
  "isComplete": true,
  "enrichmentResults": {
    "topic": "original topic",
    "totalAuthorsProcessed": 15,
    "contactsEnriched": 12,
    "enrichmentSuccessRate": "80%",
    "mediaContactsList": [
      {
        "rank": 1,
        "authorId": "author-id-from-db",
        "name": "Author Name",
        "title": "Senior Reporter",
        "organization": "Media Organization", 
        "email": "author@media.com",
        "phone": "+1-555-0123",
        "linkedin": "linkedin.com/in/author",
        "twitter": "@authorhandle",
        "relevanceScore": 15.2,
        "articleCount": 12,
        "recentTopics": ["topic1", "topic2"],
        "lastArticleDate": "2024-01-15",
        "contactConfidence": "high",
        "enrichmentSource": "rocketreach"
      }
    ],
    "listGeneratedAt": "ISO timestamp",
    "creditsUsed": 12,
    "rateLimitStatus": "normal"
  },
  "nextMessage": "Media contacts list generated successfully! Found complete contact information for [X] of [Y] authors. The list is prioritized by relevance to '[topic]' and contact completeness.",
  "suggestedNextStep": null
}

If enrichment has issues:
{
  "isComplete": false,
  "enrichmentResults": {
    "topic": "original topic",
    "totalAuthorsProcessed": 15,
    "contactsEnriched": 8,
    "enrichmentSuccessRate": "53%",
    "partialResults": "array of partial results",
    "apiErrors": ["RocketReach rate limit", "Contact not found for Author X"],
    "creditsUsed": 8
  },
  "nextMessage": "Encountered some issues during contact enrichment. Successfully found [X] of [Y] contacts. Would you like to proceed with partial results or retry the failed lookups?",
  "suggestedNextStep": null
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 