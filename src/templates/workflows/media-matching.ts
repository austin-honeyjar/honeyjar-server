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
        baseInstructions: `Generate 20 potential journalists and 10 keywords for this topic. These will be filtered down to the top 10 based on actual article relevance.

TWO-PHASE APPROACH:
- **PHASE 1**: Generate 20 potential authors who might write about this topic
- **PHASE 2**: Algorithmic filtering will reduce to top 10 with actual relevant recent articles
- **GOAL**: Cast a wider net to ensure we find authors with real recent coverage

🎯 **CRITICAL: RECENT PUBLICATION FOCUS**
Your PRIMARY job is suggesting authors who have RECENTLY written about this SPECIFIC topic area (not just general industry). Think:
- Who covered similar fundraising announcements in the past 6 months?
- Which reporters specifically write about autonomous delivery/robotics (not just "tech")?
- Who follows this exact company type, technology, or market segment?
- What journalists have bylines on stories about related companies, funding rounds, or innovations?

REQUIREMENTS:
- 20 real journalist names (no placeholders like "John Doe")
- Industry/trade publications prioritized for niche topics  
- One author per publication (no duplicates)
- Score recent topic relevance 1-10 for each author based on likelihood they've written about THIS specific topic recently
- 2-3 sentence reasoning explaining why contact each author AND what specific recent articles they likely wrote
- 10 relevant keywords

🔍 **ENHANCED AUTHOR SELECTION STRATEGY**:
**STEP 1: Topic-Specific Beat Reporters**
- Start with journalists who specifically cover the exact topic area (e.g., autonomous delivery, not just "transportation")
- Look for reporters who regularly write about funding rounds in this specific industry
- Include beat reporters from trade publications who focus on this niche

**STEP 2: Company/Competitor Coverage**
- Find authors who've written about similar companies, competitors, or industry players
- Include journalists who covered related funding announcements or product launches
- Look for reporters who follow specific investors, accelerators, or VCs in this space

**STEP 3: Strategic Adjacent Coverage**
- Include emerging voices and specialized beat reporters with relevant recent coverage
- Consider authors who cover adjacent topics that frequently intersect (e.g., AI + logistics, robotics + urban planning)
- Focus on authors likely to have written SOMETHING directly related in past 3-6 months

**STEP 4: Publication Strategy**
- Mix obvious tier-1 choices with niche specialists who have recent relevant coverage
- Include less obvious but highly relevant specialists from trade publications
- Prioritize active coverage over publication size for niche topics

🎯 **PUBLICATION PRIORITIZATION**:
**For Tech/Business Topics**: 
- **First Priority**: Authors with recent coverage of similar companies, funding, or technology
- **Trade Publications**: TechCrunch (funding), The Information (inside tech), Forbes (business), Axios (tech policy)
- **Industry Specialist**: VentureBeat (funding), IEEE Spectrum (robotics), Supply Chain Dive (logistics)
- **Major Outlets**: Only if they have reporters who specifically cover this beat

**For Niche Topics**: 
- **Prioritize trade/industry publications** with recent relevant coverage over general news
- **Focus**: Authors actively covering this topic area with recent relevant content
- **Include**: Specialized publications that readers in this industry actually follow

🚨 **CRITICAL INSTRUCTIONS**:
- Use REAL journalist names like "Kirsten Korosec" (TechCrunch autonomous vehicles), "Alex Davies" (Wired transportation tech), "Will Knight" (Wired AI)
- NO placeholder names like "John Doe", "Jane Smith", "Author Name"
- Always return "isComplete": true to auto-proceed
- Include actual author names in nextQuestion response
- For "reasoning" field: Specifically mention what recent articles they likely wrote about this topic

JSON RESPONSE:
{
  "isComplete": true,
  "collectedInformation": {
    "topic": "the topic",
    "totalSuggestions": 20,
    "suggestedAuthors": [
      {
        "id": "author-1",
        "name": "Real Author Name",
        "alternativeNames": ["Alt Name"],
        "organization": "Publication Name", 
        "expertise": "specific expertise area",
        "reasoning": "2-3 sentence explanation of relevance and what recent articles they likely wrote on this topic",
        "publicationType": "major_news|trade_publication|independent",
        "searchPriority": "high|medium|low",
        "recentTopicRelevance": 8,
        "analysisInsight": "2-3 sentence why contact explanation based on their likely recent article coverage of this specific topic"
      }
    ],
    "targetedKeywords": [
      {
        "keyword": "relevant keyword",
        "category": "industry_term|company_name|technical_term", 
        "priority": "high|medium|low"
      }
    ],
    "generationStrategy": "Two-phase: 20 potential authors, algorithmic filtering to top 10",
    "searchReadiness": true
  },
  "nextQuestion": "**AI Author Generation Complete!**\n\nI've identified 20 potential authors who might write about '[topic]'. These will be searched for actual recent articles and algorithmically filtered to the top 10 with real coverage:\n\n**Potential Authors for Article Search:**\n1. **[Author 1 Name]** ([Organization]) - Likelihood: [X/10]\n2. **[Author 2 Name]** ([Organization]) - Likelihood: [X/10]\n[...list all 20 with actual names from suggestedAuthors]\n\n**Keywords:** [list 10 keywords]\n\n**Proceeding automatically to search for their actual recent articles...**",
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