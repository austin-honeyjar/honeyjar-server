import axios, { AxiosInstance } from 'axios';
import * as xml2js from 'xml2js';
import logger from '../utils/logger';

export interface Article {
  id: string;
  title: string;
  summary: string;
  content?: string;
  url: string;
  clickUrl?: string; // Some articles require clicking for royalty compliance
  source: string;
  publishedAt: string;
  updateDate?: string;
  author?: string;
  topics: string[];
  licenses: string[]; // License information for compliance
  metadata?: Record<string, any>;
}

export interface ArticleSearchResponse {
  articles: Article[];
  totalCount: number;
  hasMore: boolean;
  nextPage?: string;
  lastSequenceId?: string; // Sequence ID from the last article for next call
}

export interface RevokedArticlesResponse {
  revokedArticles: string[]; // Array of article IDs that should be removed
  sequenceId: string; // Next sequence ID for pagination
  totalCount: number;
}

export interface ArticleSearchParams {
  query?: string;
  limit?: number; // Maximum 500 articles per call
  offset?: number;
  startDate?: string;
  endDate?: string;
  sources?: string[];
  sortBy?: 'relevance' | 'date' | 'popularity';
  sequenceId?: string; // For sequential calls to avoid duplicates
  // Load balancing parameters from Python example
  numberOfSlices?: number; // Number of slices/clients calling the API
  sliceIndex?: number; // The slice this client is using (0-based)
}

export interface RevokedArticlesParams {
  limit?: number; // 1-10,000 revoked articles per request
  sequenceId?: string; // For pagination, start with "0" for initial request
}

// Metabase API error codes from Python example
export const METABASE_ERROR_CODES = {
  1000: 'Invalid m parameter',
  1001: 'Profile not found', 
  1002: 'Authentication failure',
  1003: 'Authorization failure',
  1004: 'Too frequent calls', // Rate limit exceeded
  1005: 'Unsupported output format associated with the user profile',
  1006: 'Invalid last_id parameter',
  1007: 'Invalid limit parameter',
  1008: 'Invalid sequence_id parameter',
  9999: 'An error has occurred'
} as const;

// Rate limiting constants from Python example
export const METABASE_RATE_LIMITS = {
  MIN_PAUSE_BETWEEN_CALLS: 20000, // 20 seconds minimum
  HIGH_VOLUME_FREQUENCY: 30000,   // 30 seconds for high volume customers
  MAX_ARTICLES_PER_CALL: 500      // Maximum articles per request
} as const;

export class PartnersService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;
  private xmlParser: xml2js.Parser;

  constructor() {
    this.apiKey = process.env.METABASE_API_KEY || '';
    this.baseUrl = process.env.METABASE_BASE_URL || 'http://metabase.moreover.com';
    
    logger.info('🚀 Initializing PartnersService', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey.length,
      baseUrl: this.baseUrl
    });
    
    if (!this.apiKey) {
      logger.error('METABASE_API_KEY environment variable is missing');
      throw new Error('METABASE_API_KEY environment variable is required');
    }

    // Initialize XML parser
    this.xmlParser = new xml2js.Parser({
      explicitArray: true, // Always create arrays to handle multiple articles consistently
      ignoreAttrs: false,
      mergeAttrs: true,
      explicitChildren: false,
      explicitRoot: false
    });

    logger.debug('🔧 XML parser initialized');

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/xml',
        'Accept-Encoding': 'gzip', // Enable gzip compression as in Python example
        'Content-Type': 'application/xml',
      },
    });

    logger.info('🌐 Axios client created', {
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: this.client.defaults.headers
    });

    // Add request/response interceptors for detailed logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info('🚀 Metabase API request starting', {
          method: config.method?.toUpperCase(),
          url: config.url,
          fullUrl: `${config.baseURL}${config.url}`,
          params: config.params,
          headers: {
            'Accept': config.headers?.Accept,
            'Content-Type': config.headers?.['Content-Type'],
            'hasApiKey': !!config.params?.key
          }
        });
        return config;
      },
      (error) => {
        logger.error('❌ Metabase API request error', { 
          error: error.message,
          stack: error.stack 
        });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info('✅ Metabase API response received', {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          fullUrl: `${response.config.baseURL}${response.config.url}`,
          contentType: response.headers['content-type'],
          dataLength: response.data?.length || 0,
          dataPreview: typeof response.data === 'string' ? response.data.substring(0, 200) + '...' : 'Non-string data'
        });
        return response;
      },
      (error) => {
        logger.error('❌ Metabase API response error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          url: error.config?.url,
          fullUrl: error.config?.baseURL + error.config?.url,
          responseData: error.response?.data?.substring(0, 500),
          responseHeaders: error.response?.headers
        });
        return Promise.reject(error);
      }
    );

    logger.info('✅ PartnersService initialization completed successfully');
  }

  /**
   * Parse XML response from Metabase API
   */
  private async parseXMLResponse(xmlData: string): Promise<any> {
    try {
      const result = await this.xmlParser.parseStringPromise(xmlData);
      return result;
    } catch (error) {
      logger.error('Error parsing XML response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        xmlPreview: xmlData.substring(0, 200)
      });
      throw new Error('Failed to parse XML response');
    }
  }

  /**
   * Search for articles using the Metabase API
   * @param params Search parameters including query, filters, and pagination
   * @returns Promise<ArticleSearchResponse>
   */
  async searchArticles(params: ArticleSearchParams = {}): Promise<ArticleSearchResponse> {
    try {
      logger.info('🔍 Starting article search via Metabase API', {
        query: params.query,
        limit: params.limit,
        sortBy: params.sortBy,
        startDate: params.startDate,
        endDate: params.endDate,
        sources: params.sources,
        sequenceId: params.sequenceId,
        numberOfSlices: params.numberOfSlices,
        sliceIndex: params.sliceIndex,
        hasApiKey: !!this.apiKey,
        baseUrl: this.baseUrl
      });

      // Validate limit parameter as per Python example
      let limit = params.limit || 100;
      if (limit < 1 || limit > METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL) {
        logger.warn(`⚠️ Invalid limit ${limit}, defaulting to ${METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL}`, {
          requestedLimit: params.limit,
          maxAllowed: METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL
        });
        limit = METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL;
      }

      const requestParams: any = {
        key: this.apiKey,
        limit: limit,
      };

      // Add optional parameters if provided
      if (params.query) {
        requestParams.q = params.query;
        logger.debug('➕ Added query parameter', { q: params.query });
      }
      if (params.sequenceId) {
        requestParams.sequence_id = params.sequenceId;
        logger.debug('➕ Added sequence_id parameter for sequential calls', { sequence_id: params.sequenceId });
      }
      if (params.startDate) {
        requestParams.start_date = params.startDate;
        logger.debug('➕ Added start_date parameter', { start_date: params.startDate });
      }
      if (params.endDate) {
        requestParams.end_date = params.endDate;
        logger.debug('➕ Added end_date parameter', { end_date: params.endDate });
      }
      if (params.sources?.length) {
        requestParams.sources = params.sources.join(',');
        logger.debug('➕ Added sources parameter', { sources: requestParams.sources });
      }
      
      // Load balancing parameters from Python example
      if (params.numberOfSlices && params.sliceIndex !== undefined) {
        requestParams.number_of_slices = params.numberOfSlices;
        requestParams.slice_number = params.sliceIndex;
        logger.debug('➕ Added load balancing parameters', { 
          number_of_slices: params.numberOfSlices, 
          slice_number: params.sliceIndex 
        });
      }

      logger.info('📋 Final request parameters', {
        endpoint: '/api/v10/articles',
        params: {
          ...requestParams,
          key: this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'MISSING' // Only log first 8 chars of key
        }
      });

      logger.info('📡 Making HTTP request to Metabase API...');
      const response = await this.client.get('/api/v10/articles', {
        params: requestParams
      });

      logger.info('📥 Raw response received, starting XML parsing...', {
        responseType: typeof response.data,
        responseLength: response.data?.length || 0,
        requestedLimit: requestParams.limit,
        isGzipped: response.headers['content-encoding'] === 'gzip'
      });

      // Add debug logging to inspect raw XML structure
      if (response.data && typeof response.data === 'string') {
        // Count potential articles in raw XML
        const articleMatches = response.data.match(/<article[^>]*>/g);
        const articleCount = articleMatches ? articleMatches.length : 0;
        
        // Find all article opening and closing tags
        const articleStarts = response.data.split('<article>').length - 1;
        const articleEnds = response.data.split('</article>').length - 1;
        
        // Look for specific patterns
        const articlesBlockStart = response.data.indexOf('<articles>');
        const articlesBlockEnd = response.data.indexOf('</articles>');
        const articlesContent = articlesBlockStart !== -1 && articlesBlockEnd !== -1 
          ? response.data.substring(articlesBlockStart, articlesBlockEnd + 11)
          : 'Not found';
        
        logger.info('🔍 DEBUG: Raw XML analysis', {
          xmlLength: response.data.length,
          articleTagsFound: articleCount,
          articleStarts,
          articleEnds,
          articlesBlockFound: articlesBlockStart !== -1,
          articlesContent: articlesContent.substring(0, 800) + (articlesContent.length > 800 ? '...' : ''),
          xmlPreview: response.data.substring(0, 500) + '...',
          xmlEnd: '...' + response.data.substring(response.data.length - 200)
        });
      }

      // Parse XML response
      const parsedResponse = await this.parseXMLResponse(response.data);
      
      // Add detailed logging of the parsed structure
      logger.info('🔍 DEBUG: Full parsed structure inspection', {
        parsedKeys: Object.keys(parsedResponse),
        hasResponse: !!parsedResponse.response,
        responseIsArray: Array.isArray(parsedResponse.response),
        responseType: typeof parsedResponse.response,
        directStructure: JSON.stringify(parsedResponse, null, 2).substring(0, 1000) + '...'
      });
      
      logger.info('🔄 XML parsing completed, transforming to JSON format...');
      
      // Transform the response to match our interface
      const articlesData = this.transformArticlesResponse(parsedResponse);

      logger.info('✅ Articles search completed successfully', {
        requestedLimit: requestParams.limit,
        articlesFound: articlesData.articles.length,
        totalCount: articlesData.totalCount,
        hasMore: articlesData.hasMore,
        lastSequenceId: articlesData.lastSequenceId,
        sampleTitles: articlesData.articles.slice(0, 3).map(a => a.title)
      });

      return articlesData;
    } catch (error: any) {
      // Enhanced error handling with Metabase error codes
      const errorInfo = this.parseMetabaseError(error);
      
      logger.error('💥 Error in searchArticles method', {
        query: params.query,
        error: errorInfo.message,
        errorCode: errorInfo.code,
        errorType: error?.constructor?.name || 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        hasApiKey: !!this.apiKey,
        baseUrl: this.baseUrl
      });
      throw error;
    }
  }

  /**
   * Get revoked articles that should be removed from your system
   * This should be called daily to stay compliant
   * @param params Parameters including limit and sequence_id for pagination
   * @returns Promise<RevokedArticlesResponse>
   */
  async getRevokedArticles(params: RevokedArticlesParams = {}): Promise<RevokedArticlesResponse> {
    try {
      logger.info('🔄 Fetching revoked articles via Metabase API', {
        limit: params.limit,
        sequenceId: params.sequenceId
      });

      const requestParams = {
        key: this.apiKey,
        limit: params.limit || 1000, // Default to 1000, max 10,000
        sequence_id: params.sequenceId || '0' // Start with 0 for initial request
      };

      const response = await this.client.get('/api/v10/revokedArticles', {
        params: requestParams
      });

      // Parse XML response
      const parsedResponse = await this.parseXMLResponse(response.data);
      const revokedData = this.transformRevokedArticlesResponse(parsedResponse);

      logger.info('✅ Revoked articles fetched successfully', {
        revokedCount: revokedData.revokedArticles.length,
        nextSequenceId: revokedData.sequenceId
      });

      return revokedData;
    } catch (error) {
      logger.error('💥 Error fetching revoked articles via Metabase API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get article by ID (simulate since Metabase doesn't have a direct ID endpoint)
   * @param articleId The ID of the article to retrieve
   * @returns Promise<Article>
   */
  async getArticleById(articleId: string): Promise<Article> {
    try {
      logger.info('🔍 Searching for specific article by ID', { articleId });

      // Since Metabase doesn't have a direct article by ID endpoint,
      // we'll search for articles and filter by ID
      const response = await this.searchArticles({ limit: 1000 });
      
      const article = response.articles.find(a => a.id === articleId);
      
      if (!article) {
        throw new Error(`Article with ID ${articleId} not found`);
      }

      logger.info('✅ Article found by ID', {
        articleId,
        title: article.title,
        source: article.source
      });

      return article;
    } catch (error) {
      logger.error('💥 Error fetching article by ID', {
        articleId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get trending topics (simulated from recent articles)
   * @param limit Number of topics to return (default: 10)
   * @returns Promise<string[]>
   */
  async getTrendingTopics(limit: number = 10): Promise<string[]> {
    try {
      logger.info('📊 Generating trending topics from recent articles', { limit });

      // Get recent articles to extract trending topics
      const response = await this.searchArticles({ limit: 500 });
      
      // Extract and count topics from recent articles
      const topicCounts: Record<string, number> = {};
      
      response.articles.forEach(article => {
        article.topics.forEach(topic => {
          if (topic && topic.trim()) {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          }
        });
      });

      // Sort topics by frequency and return top ones
      const sortedTopics = Object.entries(topicCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([topic]) => topic);

      logger.info('✅ Trending topics generated successfully', {
        topicsCount: sortedTopics.length,
        sampleTopics: sortedTopics.slice(0, 5)
      });

      return sortedTopics;
    } catch (error) {
      logger.error('💥 Error generating trending topics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get available news sources (simulated from recent articles)
   * @returns Promise<string[]>
   */
  async getNewsSources(): Promise<string[]> {
    try {
      logger.info('📰 Fetching available news sources from recent articles');

      // Get recent articles to extract sources
      const response = await this.searchArticles({ limit: 1000 });
      
      // Extract unique sources
      const sources = [...new Set(response.articles.map(article => article.source).filter(s => s && s.trim()))];

      logger.info('✅ News sources extracted successfully', {
        sourcesCount: sources.length,
        sampleSources: sources.slice(0, 5)
      });

      return sources;
    } catch (error) {
      logger.error('💥 Error fetching news sources', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Transform the Metabase XML API response to match our Article interface
   */
  private transformArticleResponse(articleData: any): Article {
    // Helper function to extract string value from potential array
    const extractString = (value: any): string => {
      if (Array.isArray(value)) {
        return value[0] || '';
      }
      return value || '';
    };

    // Helper function to extract number value from potential array
    const extractNumber = (value: any): number => {
      const str = extractString(value);
      return parseInt(str, 10) || 0;
    };

    // Handle the case where topics might be a string, array, or object
    let topics: string[] = [];
    if (articleData.topics) {
      if (typeof articleData.topics === 'string') {
        topics = [articleData.topics];
      } else if (Array.isArray(articleData.topics)) {
        topics = articleData.topics
          .filter((t: any) => t && typeof t === 'string' && t.trim())
          .map((t: string) => t.trim());
      } else if (articleData.topics.topic) {
        const topicData = articleData.topics.topic;
        if (Array.isArray(topicData)) {
          topics = topicData
            .filter((t: any) => t && typeof t === 'string' && t.trim())
            .map((t: string) => t.trim());
        } else if (typeof topicData === 'string' && topicData.trim()) {
          topics = [topicData.trim()];
        }
      }
    }

    // Extract author name
    let authorName = '';
    if (articleData.author) {
      if (Array.isArray(articleData.author)) {
        authorName = extractString(articleData.author[0]?.name);
      } else {
        authorName = extractString(articleData.author?.name);
      }
    }

    // Extract source name
    let sourceName = '';
    if (articleData.source) {
      if (Array.isArray(articleData.source)) {
        sourceName = extractString(articleData.source[0]?.name);
      } else {
        sourceName = extractString(articleData.source?.name);
      }
    }

    // Create summary from content if not available
    const content = extractString(articleData.content);
    let summary = '';
    if (content) {
      summary = content.length > 200 
        ? content.substring(0, 200) + '...'
        : content;
    }

    return {
      id: extractString(articleData.id) || extractString(articleData.sequenceId),
      title: extractString(articleData.title),
      summary: summary,
      content: content,
      url: extractString(articleData.url),
      clickUrl: extractString(articleData.clickUrl),
      source: sourceName,
      publishedAt: extractString(articleData.publishedDate) || extractString(articleData.estimatedPublishedDate),
      updateDate: extractString(articleData.updateDate),
      author: authorName,
      topics: topics,
      licenses: [],
      metadata: {
        sequenceId: extractString(articleData.sequenceId),
        language: extractString(articleData.language),
        languageCode: extractString(articleData.languageCode),
        harvestDate: extractString(articleData.harvestDate),
        wordCount: extractNumber(articleData.wordCount),
        dataFormat: extractString(articleData.dataFormat),
        duplicateGroupId: extractString(articleData.duplicateGroupId),
        adultLanguage: extractString(articleData.adultLanguage) === 'true',
        source: {
          id: extractString(articleData.source?.id || (Array.isArray(articleData.source) ? articleData.source[0]?.id : undefined)),
          publisher: extractString(articleData.source?.publisher || (Array.isArray(articleData.source) ? articleData.source[0]?.publisher : undefined)),
          category: extractString(articleData.source?.category || (Array.isArray(articleData.source) ? articleData.source[0]?.category : undefined)),
          editorialRank: extractString(articleData.source?.editorialRank || (Array.isArray(articleData.source) ? articleData.source[0]?.editorialRank : undefined)),
          country: extractString(articleData.source?.location?.country || (Array.isArray(articleData.source) ? articleData.source[0]?.location?.[0]?.country : undefined)),
          countryCode: extractString(articleData.source?.location?.countryCode || (Array.isArray(articleData.source) ? articleData.source[0]?.location?.[0]?.countryCode : undefined))
        }
      }
    };
  }

  /**
   * Transform the Metabase articles XML API response to match our ArticleSearchResponse interface
   */
  private transformArticlesResponse(parsedData: any): ArticleSearchResponse {
    const response = parsedData.response?.[0] || parsedData[0] || parsedData.response || parsedData;
    
    // Add debug logging to understand the XML structure
    logger.info('🔍 DEBUG: Analyzing parsed XML structure', {
      hasResponse: !!response,
      responseStatus: response?.status?.[0] || response?.status,
      hasArticles: !!response?.articles,
      articlesType: typeof response?.articles,
      hasArticleArray: !!response?.articles?.[0]?.article,
      articleType: typeof response?.articles?.[0]?.article,
      isArticleArray: Array.isArray(response?.articles?.[0]?.article),
      articleCount: Array.isArray(response?.articles?.[0]?.article) ? response.articles[0].article.length : (response?.articles?.[0]?.article ? 1 : 0),
      responseKeys: response ? Object.keys(response) : [],
      articlesKeys: response?.articles?.[0] ? Object.keys(response.articles[0]) : []
    });
    
    // Check for successful response
    const status = response.status?.[0] || response.status;
    if (status !== 'SUCCESS') {
      const userMessage = response.userMessage?.[0] || response.userMessage;
      const developerMessage = response.developerMessage?.[0] || response.developerMessage;
      throw new Error(`API returned status: ${status}. Message: ${userMessage || developerMessage || 'Unknown error'}`);
    }

    // Extract articles - handle both single and multiple articles structures
    let articles: any[] = [];
    
    // Log the articles structure in detail
    logger.info('🔍 DEBUG: Articles structure details', {
      hasArticlesArray: !!response.articles,
      articlesIsArray: Array.isArray(response.articles),
      articlesLength: Array.isArray(response.articles) ? response.articles.length : 'not array',
      articlesStructure: JSON.stringify(response.articles, null, 2).substring(0, 500) + '...',
      firstArticleHasArticle: !!response.articles?.[0]?.article,
      firstArticleArticleType: typeof response.articles?.[0]?.article,
      firstArticleArticleIsArray: Array.isArray(response.articles?.[0]?.article),
      firstArticleArticleLength: Array.isArray(response.articles?.[0]?.article) ? response.articles[0].article.length : 'not array'
    });
    
    if (response.articles && Array.isArray(response.articles)) {
      // Multiple articles blocks - iterate through each
      logger.info('🔍 Found multiple articles blocks', { count: response.articles.length });
      
      for (let i = 0; i < response.articles.length; i++) {
        const articlesBlock = response.articles[i];
        if (articlesBlock?.article) {
          if (Array.isArray(articlesBlock.article)) {
            // Multiple articles in this block
            articles.push(...articlesBlock.article);
            logger.info(`📚 Block ${i}: Found ${articlesBlock.article.length} articles in array`);
          } else {
            // Single article in this block
            articles.push(articlesBlock.article);
            logger.info(`📖 Block ${i}: Found single article`);
          }
        }
      }
    } else if (response.articles?.[0]?.article) {
      // Single articles block
      const articleData = response.articles[0].article;
      if (Array.isArray(articleData)) {
        articles = articleData;
        logger.info('📚 Found multiple articles in single block array', { count: articles.length });
      } else {
        articles = [articleData];
        logger.info('📖 Found single article in single block');
      }
    } else {
      logger.warn('⚠️ No articles found in response', {
        hasArticles: !!response.articles,
        articlesStructure: response.articles
      });
    }

    const transformedArticles = articles.map(article => this.transformArticleResponse(article));

    logger.info('✅ Articles transformation completed', {
      originalCount: articles.length,
      transformedCount: transformedArticles.length,
      sampleIds: transformedArticles.slice(0, 3).map(a => a.id)
    });

    return {
      articles: transformedArticles,
      totalCount: transformedArticles.length,
      hasMore: false,
      nextPage: undefined,
      lastSequenceId: transformedArticles.length > 0 ? transformedArticles[transformedArticles.length - 1].metadata?.sequenceId : undefined
    };
  }

  /**
   * Transform the Metabase revoked articles XML API response
   */
  private transformRevokedArticlesResponse(parsedData: any): RevokedArticlesResponse {
    const response = parsedData.response?.[0] || parsedData[0] || parsedData.response || parsedData;
    
    // Check for successful response
    const status = response.status?.[0] || response.status;
    if (status !== 'SUCCESS') {
      const userMessage = response.userMessage?.[0] || response.userMessage;
      const developerMessage = response.developerMessage?.[0] || response.developerMessage;
      throw new Error(`API returned status: ${status}. Message: ${userMessage || developerMessage || 'Unknown error'}`);
    }

    // Extract revoked article IDs
    let revokedArticles: string[] = [];
    if (response.revokedArticles?.[0]?.article) {
      const articleData = response.revokedArticles[0].article;
      if (Array.isArray(articleData)) {
        revokedArticles = articleData.map((article: any) => 
          (article.id?.[0] || article.id) || (article.sequenceId?.[0] || article.sequenceId)
        );
      } else {
        revokedArticles = [(articleData.id?.[0] || articleData.id) || (articleData.sequenceId?.[0] || articleData.sequenceId)];
      }
    } else if (response.articles?.[0]?.article) {
      // If revoked articles are returned in the same format as regular articles
      const articleData = response.articles[0].article;
      if (Array.isArray(articleData)) {
        revokedArticles = articleData.map((article: any) => 
          (article.id?.[0] || article.id) || (article.sequenceId?.[0] || article.sequenceId)
        );
      } else {
        revokedArticles = [(articleData.id?.[0] || articleData.id) || (articleData.sequenceId?.[0] || articleData.sequenceId)];
      }
    }

    return {
      revokedArticles: revokedArticles.filter(id => id), // Remove any empty IDs
      sequenceId: response.sequenceId?.[0] || response.sequenceId || response.nextSequenceId?.[0] || response.nextSequenceId || '0',
      totalCount: revokedArticles.length
    };
  }

  // Legacy method for backward compatibility with existing route
  async searchArticlesByTopic(params: { topic: string; limit?: number; offset?: number; sortBy?: string; startDate?: string; endDate?: string; sources?: string[] }): Promise<ArticleSearchResponse> {
    return this.searchArticles({
      query: params.topic,
      limit: params.limit,
      startDate: params.startDate,
      endDate: params.endDate,
      sources: params.sources,
      sortBy: params.sortBy as 'relevance' | 'date' | 'popularity'
    });
  }
} 