import { WorkflowTemplate, StepType } from '../../types/workflow';

export const MEDIA_LIST_TEMPLATE: WorkflowTemplate = {
  id: "media-list-template",
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
      type: StepType.JSON_DIALOG,
      name: "Database Query",
      description: "Query news pipeline database for relevant authors",
      prompt: "Searching news database for authors relevant to topic: [topic]",
      order: 1,
      dependencies: ["Topic Input"],
      metadata: {
        goal: "Query the news pipeline database to find relevant authors based on the provided topic",
        baseInstructions: `You are a media database specialist. This is STEP 2 of 3 in the workflow.

GOAL:
Query the news pipeline database to find authors who have written about the specified topic.

TASK:
1. Use the topic from Step 1 to search the news database
2. Call the news API endpoint: GET /api/v1/news/authors/top?topic=[encoded_topic]&limit=20
3. Filter and rank authors by relevance score and recent activity
4. Present the top candidates for user selection
5. Allow user to select which authors they want full contact info for

API INTEGRATION:
- Endpoint: GET /api/v1/news/authors/top
- Parameters: topic (string), limit (number, default 20)
- Response: Array of authors with relevance scores, article counts, topics, etc.

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

When database query is successful:
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "original topic from step 1",
    "databaseResults": [
      {
        "authorId": "author-id",
        "name": "Author Name",
        "relevanceScore": 15.2,
        "articleCount": 12,
        "topics": ["topic1", "topic2"],
        "organization": "Media Organization"
      }
    ],
    "selectedAuthors": ["author-id-1", "author-id-2"],
    "totalResultsFound": 15
  },
  "nextQuestion": "Found [X] relevant authors. Selected [Y] for contact lookup. Proceeding to RocketReach API...",
  "suggestedNextStep": "Contact Enrichment"
}

If no relevant authors found:
{
  "isComplete": false,
  "collectedInformation": {
    "topic": "original topic",
    "searchAttempted": true,
    "resultsFound": 0
  },
  "nextQuestion": "No authors found for this topic in our database. Would you like to try a different topic or broader search terms?"
}

If user needs to refine selection:
{
  "isComplete": false,
  "collectedInformation": {
    "topic": "original topic",
    "databaseResults": "array of results",
    "pendingSelection": true
  },
  "nextQuestion": "Here are the top relevant authors: [list]. Please select which ones you'd like full contact information for, or say 'all' for everyone."
}`
      }
    },
    {
      type: StepType.JSON_DIALOG,
      name: "Contact Enrichment",
      description: "Use RocketReach API to get full contact information and generate media list",
      prompt: "Enriching contact information using RocketReach API for selected authors...",
      order: 2,
      dependencies: ["Database Query"],
      metadata: {
        goal: "Use RocketReach API to get complete contact information and generate final media list",
        baseInstructions: `You are a contact enrichment specialist. This is STEP 3 of 3 in the workflow.

GOAL:
Use RocketReach API to get complete contact information for selected authors and generate a prioritized media contacts list.

TASK:
1. For each selected author from Step 2, query RocketReach API for contact details
2. Compile comprehensive contact information (email, phone, social media, etc.)
3. Create a prioritized list ordered by relevance score
4. Format as a professional media contacts asset
5. Provide download/export options

ROCKETREACH API INTEGRATION:
- Search by name and organization
- Retrieve email, phone, LinkedIn, Twitter
- Handle API rate limits and errors gracefully
- Use fallback strategies if direct matches not found

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

When contact enrichment is successful:
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "original topic",
    "mediaContactsList": [
      {
        "rank": 1,
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
        "lastArticleDate": "2024-01-15"
      }
    ],
    "totalContacts": 8,
    "enrichmentSuccess": "87%",
    "listGeneratedAt": "ISO timestamp"
  },
  "nextQuestion": "Media contacts list generated successfully! Found complete contact information for [X] of [Y] selected authors. The list is prioritized by relevance to '[topic]'. Would you like to export this list or make any modifications?",
  "suggestedNextStep": null
}

If enrichment has issues:
{
  "isComplete": false,
  "collectedInformation": {
    "topic": "original topic",
    "enrichmentAttempted": true,
    "partialResults": "array of partial results",
    "apiErrors": ["RocketReach rate limit", "Contact not found for Author X"]
  },
  "nextQuestion": "Encountered some issues during contact enrichment. Successfully found [X] of [Y] contacts. Would you like to proceed with partial results or retry the failed lookups?"
}`
      }
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}; 