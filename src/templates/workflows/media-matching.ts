import { WorkflowTemplate, StepType } from '../../types/workflow';

export const MEDIA_MATCHING_TEMPLATE: WorkflowTemplate = {
  id: "00000000-0000-0000-0000-000000000006",
  name: "Media Matching",
  description: "Use AI to suggest relevant authors, then search for their recent articles using news pipeline data to match topic relevance",
  steps: [
    {
      type: StepType.JSON_DIALOG,
      name: "Topic Input",
      description: "Collect topic/subject matter for media matching analysis",
      prompt: "Please provide the topic or subject matter you want to analyze for media matching. I'll use AI to suggest relevant authors who typically write about this topic, then search for their recent articles to show topic relevance and coverage.",
      order: 0,
      dependencies: [],
      metadata: {
        goal: "Collect topic input from user to determine relevant media authors and articles",
        essential: ["collectedInformation"],
        initialPromptSent: false,
        baseInstructions: `You are a media matching assistant. This is STEP 1 of 4 in the workflow.

GOAL:
Collect the topic or subject matter for which the user wants to analyze media coverage and author relevance.

TASK:
1. Accept specific topics for media matching analysis
2. Store the topic for use in AI author generation and article searches
3. Only mark as complete when you have actionable topic input

EXAMPLES OF ACCEPTABLE INPUTS:
- Specific: "artificial intelligence in healthcare", "renewable energy policy", "cryptocurrency regulation"
- Industry: "fintech", "biotech", "climate tech"
- General: "AI", "healthcare", "technology", "climate change"

RESPONSE FORMAT:
You MUST respond with a valid JSON object following this structure:

If the user provides a valid topic:
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "user's topic exactly as provided",
    "topicKeywords": ["keyword1", "keyword2", "keyword3"],
    "topicCategory": "general category (e.g. technology, healthcare, policy, etc.)",
    "searchContext": "context for AI author generation"
  },
  "nextQuestion": "Perfect! I'll use AI to identify authors who typically write about '[topic]', then search for their recent articles. Moving to AI author generation...",
  "suggestedNextStep": "AI Author Generation"
}

Only if the user's input is unclear or too vague:
{
  "isComplete": false,
  "collectedInformation": {
    "lastInput": "user's input"
  },
  "nextQuestion": "I need a specific topic to analyze media coverage effectively. Please provide a topic like 'artificial intelligence', 'climate policy', 'fintech regulation', or any subject you want to analyze for media coverage and author expertise."
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
        autoExecute: true, // Auto-execute after completion
        baseInstructions: `You are an AI author identification specialist. This is STEP 2 of 4 in the workflow.

GOAL:
Use AI to generate a list of 10 authors who are likely to write about the specified topic based on expertise and industry knowledge, PLUS generate 10 targeted keywords for enhanced algorithmic relevance matching.

CONTEXT:
You will receive the topic from Step 1. Your job is to generate relevant author suggestions who typically write about this topic, AND create targeted keywords that will improve algorithmic matching of their articles.

TASK:
1. Use the topic from Step 1 to generate relevant author suggestions
2. Focus on journalists, reporters, and industry experts
3. Include authors from various publication tiers (major news, trade publications, independent media)
4. Consider both mainstream and specialized media authors
5. Generate 10 targeted keywords for enhanced article relevance matching
6. Prepare author list for Metabase article searches

AUTHOR GENERATION LOGIC:
1. Generate 10 author suggestions based on topic expertise
2. Include variety across publication types and expertise levels
3. Provide reasoning for each author suggestion
4. Format for Metabase search compatibility
5. Include alternative name variations for search accuracy

KEYWORD GENERATION LOGIC:
1. Generate 10 targeted keywords that are highly relevant to the topic
2. Include industry-specific terms, technical terminology, and key concepts
3. Consider variations (singular/plural, abbreviations, synonyms)
4. Include company names, product names, and technology terms if relevant
5. Focus on terms likely to appear in article titles, summaries, and metadata

REQUIREMENTS:
1. Focus on actual journalists, reporters, and industry experts
2. Include authors from various publication tiers:
   - Major news outlets (NYT, WSJ, BBC, CNN, Reuters, etc.)
   - Trade publications and industry magazines
   - Independent media and specialized outlets
   - Technology/business publications if relevant
3. Consider both mainstream and specialized media authors
4. Include alternative name formats for search accuracy
5. Provide reasoning for each suggestion
6. Generate precise keywords for algorithmic matching enhancement

GUIDELINES:
- Prioritize authors you're confident actually exist and write about this topic
- Include diversity in publication types and expertise levels
- Use high priority for well-known experts, medium for specialized journalists, low for emerging voices
- Alternative names should include common variations (with/without middle names, nicknames, etc.)
- Focus on authors likely to have recent articles (active journalists)
- Avoid fictional or uncertain author names
- Keywords should be specific, searchable, and highly relevant to the topic

CRITICAL INSTRUCTIONS:
1. Generate REAL author names and details (not placeholders)
2. Include the actual author list with names, organizations, and expertise in your nextQuestion response
3. Include the 10 targeted keywords in your response for enhanced matching
4. Use this exact format for nextQuestion:

"🤖 **AI Author Generation Complete!**

I've identified 10 relevant authors who typically write about '[topic]':

**Suggested Authors:**
1. **[Actual Author Name]** ([Actual Organization]) - [Actual Expertise]
2. **[Actual Author Name]** ([Actual Organization]) - [Actual Expertise]
[... continue for all 10 authors using the REAL names from your suggestedAuthors array]

**Generated Keywords for Enhanced Matching:**
[keyword1], [keyword2], [keyword3], [keyword4], [keyword5], [keyword6], [keyword7], [keyword8], [keyword9], [keyword10]

**Proceeding automatically to search for their recent articles...**"

5. Make sure the nextQuestion shows the SAME author names that are in your suggestedAuthors array
6. Make sure the keywords in nextQuestion match those in your targetedKeywords array
7. IMPORTANT: Always return "isComplete": true to auto-proceed to the next step
8. Never ask for user confirmation - the workflow should flow seamlessly

CRITICAL: NEVER USE PLACEHOLDER NAMES!
- Do NOT use fake names like "John Doe", "Jane Smith", "Author Name", etc.
- ALWAYS use real journalist names like "Kirsten Korosec", "Alex Davies", "Will Knight"
- Focus on actual tech/business reporters from major publications

RESPONSE FORMAT (VALID JSON ONLY):

FIRST RESPONSE (Auto-complete and proceed):
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "original topic from step 1",
    "totalSuggestions": 10,
    "suggestedAuthors": [
      {
        "id": "unique-id-1",
        "name": "Full Author Name",
        "alternativeNames": ["Alternative Name Format", "Another Format"],
        "organization": "Primary Publication",
        "expertise": "Specific area of expertise within the topic",
        "reasoning": "Why this author is relevant - their background and typical coverage",
        "publicationType": "major_news|trade_publication|independent|academic",
        "searchPriority": "high|medium|low",
        "analysisInsight": "Two-sentence explanation of why this author is a valuable contact based on their known expertise, typical coverage areas, and relevance to the topic. This should be generated by AI using existing knowledge, not actual article content."
      }
    ],
    "targetedKeywords": [
      {
        "keyword": "specific keyword or phrase",
        "category": "industry_term|technical_term|company_name|product_name|concept",
        "priority": "high|medium|low",
        "variations": ["variation1", "variation2"],
        "reasoning": "Why this keyword is important for relevance matching"
      }
    ],
    "keywordSummary": "Brief explanation of keyword strategy for this topic",
    "generationStrategy": "AI-based expertise matching with publication diversity and enhanced keyword targeting",
    "searchReadiness": true
  },
  "nextQuestion": "🤖 **AI Author Generation Complete!**\n\nI've identified 10 relevant authors who typically write about '[topic]':\n\n**Suggested Authors:**\n[Format the 10 authors here with names and organizations]\n\n**Generated Keywords for Enhanced Matching:**\n[List the 10 keywords here]\n\n**Proceeding automatically to search for their recent articles...**",
  "suggestedNextStep": "Metabase Article Search"
}

If AI generation has issues:
{
  "isComplete": false,
  "collectedInformation": {
    "topic": "original topic",
    "error": "Description of the issue",
    "partialResults": "any partial suggestions if available"
  },
  "nextQuestion": "Had trouble generating author suggestions for this topic. Please try a more specific or different topic.",
  "suggestedNextStep": null
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
      description: "Algorithmic analysis and ranking of authors by article relevance using metadata scoring",
      prompt: "Analyzing articles using algorithmic scoring based on metadata, editorial rank, and topic relevance...",
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
        serviceCall: {
          service: "rocketreach",
          method: "enrichContacts",
          extractAuthorsFrom: "Article Analysis & Ranking.collectedInformation.top10Authors"
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