import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import { cacheService, withCache } from './cache.service';
import { metabaseDBService } from './metabaseDB.service';
import { db } from '../db';
import { metabaseArticles } from '../db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';

export interface Article {
  id: string;
  title: string;
  summary: string;
  content?: string;
  extract?: string; // First 200 characters of content
  contentWithMarkup?: string; // Content with HTML markup (optional feature)
  url: string;
  commentsUrl?: string; // URL for comments page
  outboundUrls?: string[]; // URLs found in article content
  source: string;
  publishedAt: string;
  estimatedPublishedDate?: string; // LexisNexis estimated publish date
  updateDate?: string;
  harvestDate?: string; // When LexisNexis indexed the article
  embargoDate?: string; // Licensing embargo date
  licenseEndDate?: string; // When license expires
  author?: string;
  authorDetails?: {
    name?: string;
    homeUrl?: string;
    email?: string;
    description?: string;
    dateLastActive?: string;
  };
  topics: string[];
  tags?: string[]; // User-generated tags from author
  licenses: string[]; // License information for compliance
  // Enhanced metadata from documentation
  wordCount?: number;
  dataFormat?: 'text' | 'audio' | 'video' | 'image';
  copyright?: string;
  loginStatus?: 'reg' | 'sub' | 'prem'; // Registration/subscription requirements
  duplicateGroupId?: string;
  contentGroupIds?: string[]; // License/distribution groups
  adultLanguage?: boolean;
  // Media information
  media?: {
    images?: Array<{
      url: string;
      mimeType?: string;
      caption?: string;
    }>;
    videos?: Array<{
      url: string;
      mimeType?: string;
      caption?: string;
      duration?: string;
    }>;
    audio?: Array<{
      url: string;
      mimeType?: string;
      caption?: string;
      duration?: string;
    }>;
    logos?: Array<{
      url: string;
      mimeType?: string;
    }>;
  };
  // Company mentions with stock information
  companies?: Array<{
    name: string;
    symbol?: string;
    exchange?: string;
    isin?: string;
    titleCount?: number;
    contentCount?: number;
    primary?: boolean;
  }>;
  // Topic categorization from LexisNexis
  indexTerms?: Array<{
    domains: string[];
    name: string;
    score: number;
    code?: string;
  }>;
  // Sentiment analysis
  sentiment?: {
    score: number;
    entities?: Array<{
      type: 'Person' | 'Location' | 'Company' | 'Product';
      value: string;
      mentions: number;
      score: number;
      evidence: number;
      confident: boolean;
    }>;
  };
  // Entity extraction
  semantics?: {
    entities: Array<{
      type: 'Company' | 'Organization' | 'Person';
      value: string;
      rawValue: string;
      rawValues: string;
      instances: number;
      relevance: number;
    }>;
  };
  // Location mentions with geographic data
  locations?: Array<{
    name: string;
    type: string;
    mentions: number;
    confidence: number;
    country?: {
      confidence: number;
      fipsCode: string;
      isoCode: string;
      name: string;
    };
    region: string;
    subregion: string;
    state?: {
      confidence: number;
      fipsCode: string;
      name: string;
    };
    latitude: string;
    longitude: string;
    class: string;
  }>;
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
  limit?: number; // Maximum articles per call
  sequenceId?: string; // For pagination to avoid duplicates
}

export interface SearchArticlesParams {
  query: string; // Required search query
  limit?: number; // 1-200, default 1
  format?: 'xml' | 'json' | 'rss' | 'atom'; // Default json
  recent?: string; // Search only last 3 days for faster queries - API expects "true"/"false" strings
  sequence_id?: string; // Pagination
  filter_duplicates?: string; // Remove duplicate articles - API expects "true"/"false" strings
  duplicate_order?: 'latest' | 'oldest'; // Which duplicate to show
  sort?: 'asc' | 'desc'; // Sort order, default desc
  relevance_percent?: number; // Filter by relevance 1-100
  sort_by_relevance?: string; // Sort by relevance instead of sequenceId - API expects "true"/"false" strings
  show_relevance_score?: string; // Include relevance scores - API expects "true"/"false" strings
  show_matching_keywords?: string; // Show matching keywords - API expects "true"/"false" strings
}

export interface RevokedArticlesParams {
  limit?: number; // 1-10,000 revoked articles per request
  sequenceId?: string; // For pagination, start with "0" for initial request
}

// Metabase API error codes from official documentation
export const METABASE_ERROR_CODES = {
  1000: 'Invalid key parameter',
  1001: 'Profile not found', 
  1002: 'Authentication failure',
  1003: 'Authorization failure',
  1004: 'Too frequent calls', // Rate limit exceeded
  1005: 'Unsupported output format associated with the user profile',
  1006: 'Invalid last_id parameter',
  1007: 'Invalid limit parameter',
  1008: 'Invalid sequence_id parameter',
  1009: 'Invalid number_of_slices parameter',
  1010: 'Invalid slice_number parameter',
  1011: 'number_of_slices parameter required',
  1012: 'slice_number parameter required',
  1013: 'Response slicing not permitted',
  1016: 'Invalid format parameter',
  1018: 'Too many consumers',
  1019: 'Invalid relevance_percent parameter',
  1020: 'Query has a 10000 character limit',
  1021: 'Invalid query',
  1022: 'Unknown parameter',
  9002: 'An unexpected error has occurred',
  9999: 'An error has occurred'
} as const;

// Rate limiting constants from Python example
export const METABASE_RATE_LIMITS = {
  MIN_PAUSE_BETWEEN_CALLS: 20000, // 20 seconds minimum
  HIGH_VOLUME_FREQUENCY: 30000,   // 30 seconds for high volume customers
  MAX_ARTICLES_PER_CALL: 500      // Maximum articles per request
} as const;

export class MetabaseService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.METABASE_API_KEY || '';
    this.baseUrl = process.env.METABASE_BASE_URL || 'http://metabase.moreover.com';
    
    logger.info('🚀 Initializing MetabaseService', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey.length,
      baseUrl: this.baseUrl
    });
    
    if (!this.apiKey) {
      logger.error('METABASE_API_KEY environment variable is missing');
      throw new Error('METABASE_API_KEY environment variable is required');
    }

    logger.debug('🔧 Using JSON format for Metabase API (simpler parsing)');

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json', // Default to JSON instead of XML
        'Accept-Encoding': 'gzip', // Enable gzip compression as in Python example
        'Content-Type': 'application/json',
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
          responseData: typeof error.response?.data === 'string' 
            ? error.response.data.substring(0, 500)
            : error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : 'No response data',
          responseHeaders: error.response?.headers
        });
        return Promise.reject(error);
      }
    );

    logger.info('✅ MetabaseService initialization completed successfully');
  }

  /**
   * Get recent articles using the Metabase API with caching
   * NOTE: Metabase API doesn't support search queries - only basic article retrieval
   * @param params Basic parameters for article retrieval
   * @returns Promise<ArticleSearchResponse>
   */
  async getRecentArticles(params: ArticleSearchParams = {}): Promise<ArticleSearchResponse> {
    try {
      // Generate cache key
      const cacheKey = cacheService.generateArticleKey(params);
      
      logger.info('🔍 Starting article retrieval via Metabase API', {
        limit: params.limit,
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      // Use caching with appropriate TTL (shorter for recent articles)
      const cacheOptions = {
        ttl: params.sequenceId ? 300 : 1800 // 5 minutes for paginated, 30 minutes for fresh searches
      };

      return await withCache(
        cacheKey,
        () => this.fetchArticlesFromAPI(params),
        cacheOptions
      );
    } catch (error: any) {
      // Enhanced error handling with Metabase error codes
      const errorInfo = this.parseMetabaseError(error);
      
      logger.error('💥 Error in getRecentArticles method', {
        limit: params.limit,
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
   * Get revoked articles that should be removed from your system with caching
   * This should be called daily to stay compliant
   * @param params Parameters including limit and sequence_id for pagination
   * @returns Promise<RevokedArticlesResponse>
   */
  async getRevokedArticles(params: RevokedArticlesParams = {}): Promise<RevokedArticlesResponse> {
    try {
      // Generate cache key
      const cacheKey = cacheService.generateRevokedKey(params);
      
      logger.info('🔄 Fetching revoked articles via Metabase API', {
        limit: params.limit,
        sequenceId: params.sequenceId,
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      // Use caching with shorter TTL since this is compliance-critical
      const cacheOptions = {
        ttl: 600 // 10 minutes cache for revoked articles
      };

      return await withCache(
        cacheKey,
        () => this.fetchRevokedArticlesFromAPI(params),
        cacheOptions
      );
    } catch (error) {
      logger.error('💥 Error fetching revoked articles via Metabase API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Search articles using the Metabase Search API with caching
   * Fast search across last 100 days of content with Boolean syntax support
   * @param params Search parameters including required query
   * @returns Promise<ArticleSearchResponse>
   */
  async searchArticles(params: SearchArticlesParams): Promise<ArticleSearchResponse> {
    try {
      // Generate cache key for search
      const cacheKey = cacheService.generateSearchKey(params);
      
      logger.info('🔍 Starting article search via Metabase Search API', {
        query: params.query,
        limit: params.limit,
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      // Use caching with appropriate TTL based on search type
      const cacheOptions = {
        ttl: params.recent === 'true' ? 300 : 900 // 5 minutes for recent, 15 minutes for full search
      };

      return await withCache(
        cacheKey,
        () => this.fetchSearchResultsFromAPI(params),
        cacheOptions
      );
    } catch (error: any) {
      // Enhanced error handling with Metabase error codes
      const errorInfo = this.parseMetabaseError(error);
      
      logger.error('💥 Error in searchArticles method', {
        query: params.query,
        limit: params.limit,
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
   * Private method to fetch articles from API (used by cache)
   * Only supports basic article retrieval - search parameters not supported by Metabase API
   */
  private async fetchArticlesFromAPI(params: ArticleSearchParams): Promise<ArticleSearchResponse> {
    const startTime = Date.now();
    
    logger.info('🌐 Fetching articles from Metabase API (cache miss)', {
      limit: params.limit,
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl
    });

    // Validate limit parameter
    let limit = params.limit || 100;
    if (limit < 1 || limit > METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL) {
      logger.warn(`⚠️ Invalid limit ${limit}, defaulting to ${METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL}`, {
        requestedLimit: params.limit,
        maxAllowed: METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL
      });
      limit = METABASE_RATE_LIMITS.MAX_ARTICLES_PER_CALL;
    }

    // Only use basic parameters that the API actually accepts
    const requestParams: any = {
      key: this.apiKey,
      limit: limit,
    };

    // Add sequenceId if provided (for pagination)
    if (params.sequenceId) {
      requestParams.sequence_id = params.sequenceId;
      logger.debug('➕ Added sequence_id parameter for pagination', { sequenceId: params.sequenceId });
    }
    
    // Add format parameter (JSON is more reliable than XML)
    requestParams.format = 'json';
    logger.debug('➕ Using JSON format for easier parsing');

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

    const responseTime = Date.now() - startTime;

    logger.info('📥 Articles response received, starting JSON parsing...', {
      responseType: typeof response.data,
      responseLength: response.data?.length || 0,
      requestedLimit: requestParams.limit,
      responseTime,
      isGzipped: response.headers['content-encoding'] === 'gzip'
    });

    // Parse JSON response
    const parsedResponse = response.data;
    
    logger.info('🔄 JSON parsing completed, transforming articles...');
    
    // Transform the response to match our interface
    const articlesData = this.transformArticlesResponse(parsedResponse);

    logger.info('✅ Articles transformed successfully', {
      articlesCount: articlesData.articles.length,
      hasNextPage: !!articlesData.lastSequenceId,
      nextSequenceId: articlesData.lastSequenceId,
      responseTime,
      totalProcessingTime: Date.now() - startTime
    });

    // Log API call to database for sync history
    await metabaseDBService.logApiCall({
      callType: 'articles',
      endpoint: '/api/v10/articles',
      parameters: requestParams,
      responseStatus: response.status,
      responseTime,
      articlesReturned: articlesData.articles.length,
      sequenceId: articlesData.lastSequenceId,
      cacheHit: false,
      metadata: {
        requestedLimit: limit,
        hasSequenceId: !!params.sequenceId,
        gzipEncoding: response.headers['content-encoding'] === 'gzip'
      }
    });

    // Store articles in database for persistence
    if (articlesData.articles.length > 0) {
      await metabaseDBService.storeArticles(articlesData.articles);
    }

    return articlesData;
  }

  /**
   * Private method to fetch revoked articles from API (used by cache)
   */
  private async fetchRevokedArticlesFromAPI(params: RevokedArticlesParams): Promise<RevokedArticlesResponse> {
    const startTime = Date.now();
    
    logger.info('🌐 Fetching revoked articles from Metabase API (cache miss)', {
      limit: params.limit,
      sequenceId: params.sequenceId
    });

    const requestParams = {
      key: this.apiKey,
      limit: params.limit || 1000, // Default to 1000, max 10,000
      sequenceId: params.sequenceId || '0' // Start with 0 for initial request
    };

    const response = await this.client.get('/api/v10/revokedArticles', {
      params: requestParams
    });

    const responseTime = Date.now() - startTime;

    // Parse JSON response
    const parsedResponse = response.data;
    const revokedData = this.transformRevokedArticlesResponse(parsedResponse);

    logger.info('✅ Revoked articles fetched successfully', {
      revokedCount: revokedData.revokedArticles.length,
      nextSequenceId: revokedData.sequenceId,
      responseTime
    });

    // Log API call to database for compliance tracking
    await metabaseDBService.logApiCall({
      callType: 'revoked',
      endpoint: '/api/v10/revokedArticles',
      parameters: requestParams,
      responseStatus: response.status,
      responseTime,
      articlesReturned: revokedData.revokedArticles.length,
      sequenceId: revokedData.sequenceId,
      cacheHit: false,
      metadata: {
        requestedLimit: params.limit || 1000,
        hasSequenceId: !!params.sequenceId,
        complianceCall: true
      }
    });

    // Store revoked articles for compliance tracking
    if (revokedData.revokedArticles.length > 0) {
      await metabaseDBService.storeRevokedArticles(revokedData.revokedArticles);
      await metabaseDBService.markArticlesAsRevoked(revokedData.revokedArticles);
      
      // Create compliance check record
      await metabaseDBService.createComplianceCheck(
        revokedData.revokedArticles.length,
        revokedData.revokedArticles,
        'compliant'
      );
    }

    return revokedData;
  }

  /**
   * Private method to fetch search results from API (used by cache)
   * Implements the Metabase Search API
   */
  private async fetchSearchResultsFromAPI(params: SearchArticlesParams): Promise<ArticleSearchResponse> {
    const startTime = Date.now();
    
    logger.info('🌐 Fetching search results from Metabase Search API (cache miss)', {
      query: params.query,
      limit: params.limit,
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl
    });

    // Validate limit parameter (search API has different limits)
    let limit = params.limit || 1;
    if (limit < 1 || limit > 200) {
      logger.warn(`⚠️ Invalid search limit ${limit}, defaulting to 200`, {
        requestedLimit: params.limit,
        maxAllowed: 200
      });
      limit = 200; // Default to maximum allowed instead of 1
    }

    // Build request parameters for search API
    const requestParams: any = {
      key: this.apiKey,
      query: params.query, // Required
      limit: limit,
      format: params.format || 'json' // Default to JSON
    };

    // Add US/English filters for geography and language (but NOT for author searches)
    if (params.query.includes('author:')) {
      // For author searches, don't add any additional filters as they break the search
      requestParams.query = params.query;
      logger.debug('➕ Author search detected, using query without additional filters', { 
        query: params.query,
        reason: 'Author + language filters combination breaks Metabase search'
      });
    } else if (params.query.includes('"')) {
      // For quoted searches (non-author), use more lenient filters
      if (!params.query.includes('language:en')) {
        requestParams.query = `${params.query} AND language:en`;
        logger.debug('➕ Added English language filter for quoted search', { 
          originalQuery: params.query,
          filteredQuery: requestParams.query 
        });
      } else {
        requestParams.query = params.query;
        logger.debug('➕ Language filter already present, using query as-is', { 
          query: params.query
        });
      }
    } else {
      // For general searches, use full US/English filters (but don't duplicate language filter)
      if (!params.query.includes('language:en')) {
        requestParams.query = `${params.query} AND country:US AND language:en`;
        logger.debug('➕ Added US/English filters to search query', { 
          originalQuery: params.query,
          filteredQuery: requestParams.query 
        });
      } else {
        requestParams.query = `${params.query} AND country:US`;
        logger.debug('➕ Added US filter to search query (language already present)', { 
          originalQuery: params.query,
          filteredQuery: requestParams.query 
        });
      }
    }

    // Add optional parameters
    if (params.recent === 'true') {
      requestParams.recent = 'true';
      logger.debug('➕ Added recent=true for faster 3-day search');
    }

    if (params.sequence_id) {
      requestParams.sequence_id = params.sequence_id;
      logger.debug('➕ Added sequence_id for pagination', { sequence_id: params.sequence_id });
    }

    if (params.filter_duplicates === 'true') {
      requestParams.filter_duplicates = 'true';
      logger.debug('➕ Added filter_duplicates=true');
    }

    if (params.duplicate_order) {
      requestParams.duplicate_order = params.duplicate_order;
      logger.debug('➕ Added duplicate_order', { duplicate_order: params.duplicate_order });
    }

    if (params.sort) {
      requestParams.sort = params.sort;
      logger.debug('➕ Added sort parameter', { sort: params.sort });
    }

    if (params.relevance_percent) {
      requestParams.relevance_percent = params.relevance_percent;
      logger.debug('➕ Added relevance_percent filter', { relevance_percent: params.relevance_percent });
    }

    if (params.sort_by_relevance) {
      requestParams.sort_by_relevance = params.sort_by_relevance;
      logger.debug('➕ Added sort_by_relevance', { sort_by_relevance: params.sort_by_relevance });
    }

    if (params.show_relevance_score) {
      requestParams.show_relevance_score = params.show_relevance_score;
      logger.debug('➕ Added show_relevance_score', { show_relevance_score: params.show_relevance_score });
    }

    if (params.show_matching_keywords) {
      requestParams.show_matching_keywords = params.show_matching_keywords;
      logger.debug('➕ Added show_matching_keywords', { show_matching_keywords: params.show_matching_keywords });
    }

    logger.info('📋 Final search request parameters', {
      endpoint: '/api/v10/searchArticles',
      params: {
        ...requestParams,
        key: this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'MISSING' // Only log first 8 chars of key
      }
    });

    logger.info('📡 Making HTTP request to Metabase Search API...');
    const response = await this.client.get('/api/v10/searchArticles', {
      params: requestParams
    });

    logger.info('📥 Search response received, starting JSON parsing...', {
      responseType: typeof response.data,
      responseLength: response.data?.length || 0,
      requestedLimit: requestParams.limit,
      isGzipped: response.headers['content-encoding'] === 'gzip'
    });

    // Parse JSON response
    const parsedResponse = response.data;
    
    logger.info('🔄 JSON parsing completed, transforming search results...');
    
    // Transform the response to match our interface
    const searchData = this.transformArticlesResponse(parsedResponse);

    logger.info('✅ Search completed successfully', {
      query: params.query,
      requestedLimit: requestParams.limit,
      articlesFound: searchData.articles.length,
      totalCount: searchData.totalCount,
      hasMore: searchData.hasMore,
      lastSequenceId: searchData.lastSequenceId,
      sampleTitles: searchData.articles.slice(0, 3).map(a => a.title)
    });

    const responseTime = Date.now() - startTime;

    // Log API call to database for compliance tracking
    await metabaseDBService.logApiCall({
      callType: 'search',
      endpoint: '/api/v10/searchArticles',
      parameters: requestParams,
      responseStatus: response.status,
      responseTime,
      articlesReturned: searchData.articles.length,
      sequenceId: searchData.lastSequenceId,
      cacheHit: false,
      metadata: {
        requestedLimit: limit,
        hasSequenceId: !!params.sequence_id,
        searchQuery: params.query,
        isMediaMatchingSearch: true // Flag to identify media matching searches
      }
    });

    // Store articles in database for compliance
    if (searchData.articles.length > 0) {
      await metabaseDBService.storeArticles(searchData.articles);
      
      logger.info('📝 Stored search articles for compliance', {
        storedCount: searchData.articles.length,
        searchQuery: params.query,
        endpoint: '/api/v10/searchArticles'
      });
    }

    return searchData;
  }

  /**
   * Transform the Metabase JSON API response to match our Article interface
   * This extracts ALL available fields from the comprehensive LexisNexis documentation
   */
  private transformArticleResponse(articleData: any): Article {
    // Helper function to safely extract values (JSON doesn't need array handling like XML)
    const extractString = (value: any): string => value || '';
    const extractNumber = (value: any): number => parseInt(String(value), 10) || 0;
    const extractBoolean = (value: any): boolean => value === 'true' || value === true;
    const extractArray = (value: any): any[] => Array.isArray(value) ? value : (value ? [value] : []);

    // Extract basic article information
    const id = extractString(articleData.id || articleData.sequenceId);
    const title = extractString(articleData.title);
    const content = extractString(articleData.content);
    const extract = extractString(articleData.extract) || (content.length > 200 ? content.substring(0, 200) + '...' : content);
    
    // Extract topics (handle actual JSON structure from example)
    let topics: string[] = [];
    if (articleData.topics && Array.isArray(articleData.topics)) {
      // Real structure: [{"name":"Business latest","group":"Business"}]
      topics = articleData.topics
        .map((topic: any) => extractString(topic.name))
        .filter((t: string) => t.trim());
    }

    // Extract user-generated tags (direct array or empty array)
    let tags: string[] = [];
    if (articleData.tags && Array.isArray(articleData.tags)) {
      tags = articleData.tags
        .map((tag: any) => extractString(tag.name || tag))
        .filter((t: string) => t.trim());
    }

    // Extract author information (comprehensive)
    let authorName = '';
    let authorDetails: any = undefined;
    if (articleData.author) {
      authorName = extractString(articleData.author.name);
      authorDetails = {
        name: authorName,
        homeUrl: extractString(articleData.author.homeUrl),
        email: extractString(articleData.author.email),
        description: extractString(articleData.author.description),
        dateLastActive: extractString(articleData.author.dateLastActive)
      };
      
      // Add social media author data if available
      if (articleData.author.publishingPlatform) {
        authorDetails.socialMedia = {
          userName: extractString(articleData.author.publishingPlatform.userName),
          userId: extractString(articleData.author.publishingPlatform.userId),
          statusesCount: extractNumber(articleData.author.publishingPlatform.statusesCount),
          totalViews: extractNumber(articleData.author.publishingPlatform.totalViews),
          followingCount: extractNumber(articleData.author.publishingPlatform.followingCount),
          followersCount: extractNumber(articleData.author.publishingPlatform.followersCount),
          kloutScore: extractNumber(articleData.author.publishingPlatform.kloutScore)
        };
      }
    }

    // Extract source information (comprehensive)
    let sourceName = '';
    let sourceDetails: any = {};
    if (articleData.source) {
      sourceName = extractString(articleData.source.name);
      sourceDetails = {
        id: extractString(articleData.source.id),
        name: sourceName,
        homeUrl: extractString(articleData.source.homeUrl),
        publisher: extractString(articleData.source.publisher),
        category: extractString(articleData.source.category),
        editorialRank: extractString(articleData.source.editorialRank),
        primaryLanguage: extractString(articleData.source.primaryLanguage),
        primaryMediaType: extractString(articleData.source.primaryMediaType)
      };
      
      // Extract location data
      if (articleData.source.location) {
        sourceDetails.location = {
          country: extractString(articleData.source.location.country),
          countryCode: extractString(articleData.source.location.countryCode),
          region: extractString(articleData.source.location.region),
          subregion: extractString(articleData.source.location.subregion),
          state: extractString(articleData.source.location.state),
          zipArea: extractString(articleData.source.location.zipArea),
          zipCode: extractString(articleData.source.location.zipCode)
        };
      }
      
      // Extract metrics data (MozScape)
      if (articleData.source.metrics?.mozscape) {
        sourceDetails.metrics = {
          mozRank: extractNumber(articleData.source.metrics.mozscape.mozRank),
          pageAuthority: extractNumber(articleData.source.metrics.mozscape.pageAuthority),
          domainAuthority: extractNumber(articleData.source.metrics.mozscape.domainAuthority),
          externalLinks: extractNumber(articleData.source.metrics.mozscape.externalLinks),
          links: extractNumber(articleData.source.metrics.mozscape.links)
        };
      }
    }

    // Extract media content (images, videos, audio, logos)
    let media: any = undefined;
    if (articleData.media) {
      media = {};
      
      ['image', 'video', 'audio', 'logo'].forEach(mediaType => {
        if (articleData.media[mediaType]) {
          const mediaItems = extractArray(articleData.media[mediaType]);
          media[`${mediaType}s`] = mediaItems.map((item: any) => ({
            url: extractString(item.url),
            mimeType: extractString(item.mimeType),
            caption: extractString(item.caption),
            duration: extractString(item.duration) // for video/audio
          }));
        }
      });
    }

    // Extract company mentions with stock information (direct array)
    let companies: any[] = [];
    if (articleData.companies && Array.isArray(articleData.companies)) {
      // Real structure: direct array (can be empty like "companies":[])
      companies = articleData.companies.map((company: any) => ({
        name: extractString(company.name),
        symbol: extractString(company.symbol),
        exchange: extractString(company.exchange),
        isin: extractString(company.isin),
        titleCount: extractNumber(company.titleCount),
        contentCount: extractNumber(company.contentCount),
        primary: extractBoolean(company.primary)
      }));
    }

    // Extract licenses for compliance (direct array with name objects)
    let licenses: string[] = [];
    if (articleData.licenses && Array.isArray(articleData.licenses)) {
      // Real structure: [{"name":"NLA"}]
      licenses = articleData.licenses
        .map((license: any) => extractString(license.name))
        .filter((name: string) => name && name.trim());
    }

    // Extract index terms (LexisNexis categorization)
    let indexTerms: any[] = [];
    if (articleData.indexTerms?.indexTerm) {
      indexTerms = extractArray(articleData.indexTerms.indexTerm).map((term: any) => ({
        domains: extractArray(term.domains?.domain || term.domains).map(extractString),
        name: extractString(term.name),
        score: extractNumber(term.score),
        code: extractString(term.code)
      }));
    }

    // Extract sentiment analysis (direct structure)
    let sentiment: any = undefined;
    if (articleData.sentiment) {
      // Real structure: {"score":"-0.016191173","entities":[{"type":"Location","value":"Africa",...}]}
      sentiment = {
        score: parseFloat(String(articleData.sentiment.score)) || 0
      };
      
      if (articleData.sentiment.entities && Array.isArray(articleData.sentiment.entities)) {
        sentiment.entities = articleData.sentiment.entities.map((entity: any) => ({
          type: extractString(entity.type),
          value: extractString(entity.value),
          mentions: extractNumber(entity.mentions),
          score: parseFloat(String(entity.score)) || 0,
          evidence: extractNumber(entity.evidence),
          confident: extractBoolean(entity.confident)
        }));
      }
    }

    // Extract semantic entities (properties-based structure)
    let semantics: any = undefined;
    if (articleData.semantics?.entities && Array.isArray(articleData.semantics.entities)) {
      // Real structure: {"entities":[{"properties":[{"name":"type","value":"Person"},...]}]}
      semantics = {
        entities: articleData.semantics.entities.map((entity: any) => {
          const props: any = {};
          if (entity.properties && Array.isArray(entity.properties)) {
            entity.properties.forEach((prop: any) => {
              if (prop.name && prop.value !== undefined) {
                props[prop.name] = prop.value;
              }
            });
          }
          return {
            type: extractString(props.type),
            value: extractString(props.value),
            rawValue: extractString(props.rawValue || props.value),
            rawValues: extractString(props.rawValues || props.value),
            instances: extractNumber(props.instances),
            relevance: parseFloat(String(props.relevance)) || 0
          };
        })
      };
    }

    // Extract locations mentioned in the article
    let locations: any[] = [];
    if (articleData.locations && Array.isArray(articleData.locations)) {
      locations = articleData.locations.map((location: any) => ({
        name: extractString(location.name),
        type: extractString(location.type),
        mentions: extractNumber(location.mentions),
        confidence: parseFloat(String(location.confidence)) || 0,
        country: location.country ? {
          confidence: parseFloat(String(location.country.confidence)) || 0,
          fipsCode: extractString(location.country.fipsCode),
          isoCode: extractString(location.country.isoCode),
          name: extractString(location.country.name)
        } : undefined,
        region: extractString(location.region),
        subregion: extractString(location.subregion),
        state: location.state ? {
          confidence: parseFloat(String(location.state.confidence)) || 0,
          fipsCode: extractString(location.state.fipsCode),
          name: extractString(location.state.name)
        } : undefined,
        latitude: extractString(location.latitude),
        longitude: extractString(location.longitude),
        class: extractString(location.class)
      }));
    }

    // Extract outbound URLs (direct array or empty array)
    let outboundUrls: string[] = [];
    if (articleData.outboundUrls && Array.isArray(articleData.outboundUrls)) {
      outboundUrls = articleData.outboundUrls
        .map(extractString)
        .filter((url: string) => url.trim());
    }

    // Extract publishing platform data (direct object or empty object)
    let publishingPlatformData: any = {};
    if (articleData.publishingPlatform && typeof articleData.publishingPlatform === 'object') {
      publishingPlatformData = {
        itemId: extractString(articleData.publishingPlatform.itemId),
        originalItemId: extractString(articleData.publishingPlatform.originalItemId),
        statusId: extractString(articleData.publishingPlatform.statusId),
        itemType: extractString(articleData.publishingPlatform.itemType),
        inReplyToUserId: extractString(articleData.publishingPlatform.inReplyToUserId),
        inReplyToStatusId: extractString(articleData.publishingPlatform.inReplyToStatusId),
        userMentions: extractArray(articleData.publishingPlatform.userMentions?.userMention).map(extractString),
        totalViews: extractNumber(articleData.publishingPlatform.totalViews),
        shareCount: extractNumber(articleData.publishingPlatform.shareCount)
      };
    }

    // Extract feed information (nested under source.feed in real structure)
    let feedData: any = {};
    if (articleData.source?.feed) {
      const feed = articleData.source.feed;
      feedData = {
        id: extractString(feed.id),
        name: extractString(feed.name),
        mediaType: extractString(feed.mediaType),
        generator: extractString(feed.generator),
        publishingPlatform: extractString(feed.publishingPlatform),
        description: extractString(feed.description),
        imageUrl: extractString(feed.imageUrl),
        copyright: extractString(feed.copyright),
        language: extractString(feed.language),
        dataFormat: extractString(feed.dataFormat)
      };
      
      // Extract feed rank information
      if (feed.rank) {
        feedData.rank = {
          autoRank: extractNumber(feed.rank.autoRank),
          autoRankOrder: extractNumber(feed.rank.autoRankOrder),
          inboundLinkCount: extractNumber(feed.rank.inboundLinkCount),
          inWhiteList: extractBoolean(feed.rank.inWhiteList)
        };
      }
      
      // Extract auto topics
      if (feed.autoTopics && Array.isArray(feed.autoTopics)) {
        feedData.autoTopics = feed.autoTopics.map(extractString);
      }
      
      // Extract editorial topics
      if (feed.editorialTopics && Array.isArray(feed.editorialTopics)) {
        feedData.editorialTopics = feed.editorialTopics.map(extractString);
      }
    }

    // Build comprehensive Article object
    return {
      id,
      title,
      summary: extract,
      content,
      extract,
      contentWithMarkup: extractString(articleData.contentWithMarkup),
      url: extractString(articleData.url),
      commentsUrl: extractString(articleData.commentsUrl),
      outboundUrls,
      source: sourceName,
      publishedAt: extractString(articleData.publishedDate) || extractString(articleData.estimatedPublishedDate),
      estimatedPublishedDate: extractString(articleData.estimatedPublishedDate),
      updateDate: extractString(articleData.updateDate),
      harvestDate: extractString(articleData.harvestDate),
      embargoDate: extractString(articleData.embargoDate),
      licenseEndDate: extractString(articleData.licenseEndDate),
      author: authorName,
      authorDetails,
      topics,
      tags,
      licenses,
      // Enhanced metadata from documentation
      wordCount: extractNumber(articleData.wordCount),
      dataFormat: extractString(articleData.dataFormat) as 'text' | 'audio' | 'video' | 'image',
      copyright: extractString(articleData.copyright),
      loginStatus: extractString(articleData.loginStatus) as 'reg' | 'sub' | 'prem',
      duplicateGroupId: extractString(articleData.duplicateGroupId),
      contentGroupIds: extractArray(articleData.contentGroupIds?.contentGroupId).map(extractString),
      adultLanguage: extractBoolean(articleData.adultLanguage),
      media,
      companies,
      indexTerms,
      sentiment,
      semantics,
      locations,
      metadata: {
        sequenceId: extractString(articleData.sequenceId),
        language: extractString(articleData.language),
        languageCode: extractString(articleData.languageCode),
        harvestDate: extractString(articleData.harvestDate),
        wordCount: extractNumber(articleData.wordCount),
        dataFormat: extractString(articleData.dataFormat),
        duplicateGroupId: extractString(articleData.duplicateGroupId),
        adultLanguage: extractBoolean(articleData.adultLanguage),
        source: sourceDetails,
        feed: feedData,
        publishingPlatform: publishingPlatformData,
        // Linked articles
        linkedArticles: articleData.linkedArticles?.linkedArticle ? 
          extractArray(articleData.linkedArticles.linkedArticle).map((linked: any) => ({
            type: extractString(linked.type),
            articleId: extractString(linked.articleId)
          })) : [],
        locations,
      }
    };
  }

  /**
   * Transform the Metabase articles JSON API response to match our ArticleSearchResponse interface
   */
  private transformArticlesResponse(parsedData: any): ArticleSearchResponse {
    // Based on the real example: {"status":"SUCCESS","articles":[...]}
    const response = parsedData;
    
    // Add debug logging to understand the JSON structure
    logger.info('🔍 DEBUG: Analyzing parsed JSON structure', {
      hasResponse: !!response,
      responseStatus: response?.status,
      hasArticles: !!response?.articles,
      articlesType: typeof response?.articles,
      isArticlesArray: Array.isArray(response?.articles),
      articleCount: Array.isArray(response?.articles) ? response.articles.length : 0,
      responseKeys: response ? Object.keys(response) : []
    });
    
    // Check for successful response
    const status = response.status;
    if (status !== 'SUCCESS') {
      const userMessage = response.userMessage;
      const developerMessage = response.developerMessage;
      throw new Error(`API returned status: ${status}. Message: ${userMessage || developerMessage || 'Unknown error'}`);
    }

    // Extract articles from JSON - direct array in response.articles
    let articles: any[] = [];
    
    if (response.articles && Array.isArray(response.articles)) {
      // Direct array of articles (matches the real example)
      articles = response.articles;
      logger.info('📚 Found articles array directly', { count: articles.length });
    } else {
      logger.warn('⚠️ No articles found in JSON response', {
        hasArticles: !!response.articles,
        responseStructure: Object.keys(response)
      });
    }

    const transformedArticles = articles.map(article => this.transformArticleResponse(article));

    logger.info('✅ Articles transformation completed', {
      originalCount: articles.length,
      transformedCount: transformedArticles.length,
      sampleIds: transformedArticles.slice(0, 3).map(a => a.id),
      sampleTitles: transformedArticles.slice(0, 3).map(a => a.title)
    });
    
    // ✅ DEBUG: Analyze what editorial ranks are actually being returned
    const rankAnalysis = transformedArticles.map(article => {
      const source = article.metadata?.source;
      const editorialRank = source?.editorialRank || 'unknown';
      return {
        title: article.title.substring(0, 50),
        source: article.source,
        editorialRank: editorialRank,
        hasSourceMetadata: !!source
      };
    });
    
    const rankBreakdown = rankAnalysis.reduce((acc: any, article) => {
      const rank = article.editorialRank;
      acc[rank] = (acc[rank] || 0) + 1;
      return acc;
    }, {});
    
    logger.info('🔍 DEBUG: Editorial rank analysis from Metabase API response', {
      totalArticles: transformedArticles.length,
      rankBreakdown,
      nonRank1Count: rankAnalysis.filter(a => 
        a.editorialRank !== '1' && 
        a.editorialRank !== 1 && 
        a.editorialRank !== 'unknown'
      ).length
    });
    
    // ✅ ADD: Check if API is honoring sourceRank:1 filter
    const nonRank1Sources = rankAnalysis.filter(a => 
      a.editorialRank !== '1' && 
      a.editorialRank !== 1 && 
      a.editorialRank !== 'unknown'
    );
    
    if (nonRank1Sources.length > 0) {
      logger.warn('⚠️ FILTER FAILURE: sourceRank:1 filter not working properly', {
        nonRank1Count: nonRank1Sources.length,
        totalArticles: transformedArticles.length,
        filterEffectiveness: `${Math.round(((transformedArticles.length - nonRank1Sources.length) / transformedArticles.length) * 100)}%`,
        problemSources: nonRank1Sources.slice(0, 10) // Show first 10 problem sources
      });
    } else {
      logger.info('✅ sourceRank:1 filter working correctly - all sources are Rank 1 or unknown');
    }

    return {
      articles: transformedArticles,
      totalCount: transformedArticles.length,
      hasMore: transformedArticles.length >= 500, // Assume more if we hit the max
      nextPage: undefined,
      lastSequenceId: transformedArticles.length > 0 ? transformedArticles[transformedArticles.length - 1].metadata?.sequenceId : undefined
    };
  }

  /**
   * Transform the Metabase revoked articles JSON API response
   */
  private transformRevokedArticlesResponse(parsedData: any): RevokedArticlesResponse {
    // JSON structure is much simpler than XML
    const response = parsedData.response || parsedData;
    
    // Check for successful response
    const status = response.status;
    if (status !== 'SUCCESS') {
      const userMessage = response.userMessage;
      const developerMessage = response.developerMessage;
      throw new Error(`API returned status: ${status}. Message: ${userMessage || developerMessage || 'Unknown error'}`);
    }

    // Extract revoked article IDs from JSON (much simpler than XML)
    let revokedArticles: string[] = [];
    
    if (response.revokedArticles?.article) {
      const articleData = response.revokedArticles.article;
      if (Array.isArray(articleData)) {
        revokedArticles = articleData.map((article: any) => 
          article.id || article.sequenceId
        );
      } else {
        revokedArticles = [articleData.id || articleData.sequenceId];
      }
    } else if (response.articles?.article) {
      // If revoked articles are returned in the same format as regular articles
      const articleData = response.articles.article;
      if (Array.isArray(articleData)) {
        revokedArticles = articleData.map((article: any) => 
          article.id || article.sequenceId
        );
      } else {
        revokedArticles = [articleData.id || articleData.sequenceId];
      }
    }

    return {
      revokedArticles: revokedArticles.filter(id => id), // Remove any empty IDs
      sequenceId: response.sequenceId || response.nextSequenceId || '0',
      totalCount: revokedArticles.length
    };
  }

  // Legacy method for backward compatibility with existing route
  async searchArticlesByTopic(params: { topic: string; limit?: number; offset?: number; sortBy?: string; startDate?: string; endDate?: string; sources?: string[] }): Promise<ArticleSearchResponse> {
    // Note: Metabase API doesn't support search, so this just returns basic articles
    return this.getRecentArticles({
      limit: params.limit,
    });
  }

  /**
   * Search for recent articles by specific authors and analyze topic relevance
   * SIMPLIFIED APPROACH: Direct author field search using author:"Name" syntax
   * Used by the Media Matching workflow
   * @param authors Array of author objects from AI generation
   * @param topic Original topic for relevance analysis
   * @returns Promise<object> Search results with topic relevance scoring
   */
  async searchArticlesByAuthors(authors: Array<{
    id: string;
    name: string;
    alternativeNames?: string[];
    organization?: string;
    expertise?: string;
    searchPriority?: string;
  }>, topic: string): Promise<{
    searchResults: {
      topic: string;
      authorsSearched: number;
      authorsWithArticles: number;
      totalArticlesFound: number;
      authorResults: Array<{
        authorId: string;
        name: string;
        organization: string;
        articlesFound: number;
        relevantArticles: number;
        averageRelevanceScore: number;
        mostRecentArticle: string;
        topicsWrittenAbout: string[];
        articles: Array<{
          id: string;
          title: string;
          summary: string;
          url: string;
          publishedAt: string;
          topicRelevanceScore: number;
          relevanceReason: string;
        }>;
      }>;
      searchStrategy: string;
      relevanceAnalysis: string;
      aiGeneratedKeywords?: any[]; // AI-generated keywords for enhanced relevance scoring
    };
  }> {
    try {
      logger.info('🔍 Starting SIMPLIFIED author search for Media Matching', {
        authorsCount: authors.length,
        topic,
        searchStrategy: 'Direct author:"Name" field search - much faster and more accurate!'
      });

      const authorResults = [];
      let totalArticlesFound = 0;
      let authorsWithArticles = 0;

      // Search each author using direct author field search
      for (const author of authors) {
        try {
          logger.info(`📰 Searching for articles by: ${author.name}`, {
            authorId: author.id,
            organization: author.organization,
            searchMethod: 'Direct author field search'
          });

          // Use the confirmed working author:"Name" syntax (without language filter)
          const authorQuery = `author:"${author.name}"`;
          
          logger.info(`🔍 Query: ${authorQuery}`);

          const searchResponse = await this.searchArticles({
            query: authorQuery,
            limit: 15, // Get more articles per author since this is much more accurate
            recent: 'false',
            filter_duplicates: 'true',
            sort: 'desc',
            show_relevance_score: 'true'
          });

          if (searchResponse.articles.length > 0) {
            authorsWithArticles++;
            totalArticlesFound += searchResponse.articles.length;

            // Analyze topic relevance for each article
            const articlesWithRelevance = searchResponse.articles.map(article => {
              const relevanceScore = this.calculateTopicRelevanceScore(article, topic);
              const relevanceReason = this.generateRelevanceReason(article, topic, relevanceScore);

              return {
                id: article.id,
                title: article.title,
                summary: article.summary || article.extract || '',
                url: article.url,
                publishedAt: article.publishedAt,
                topicRelevanceScore: relevanceScore,
                relevanceReason
              };
            });

            // Calculate author-level metrics
            const relevantArticles = articlesWithRelevance.filter(a => a.topicRelevanceScore > 70);
            const averageRelevanceScore = articlesWithRelevance.reduce((sum, a) => sum + a.topicRelevanceScore, 0) / articlesWithRelevance.length;
            const topicsWrittenAbout = this.extractTopicsFromArticles(searchResponse.articles);
            const mostRecentArticle = searchResponse.articles[0]?.publishedAt || '';

            authorResults.push({
              authorId: author.id,
              name: author.name,
              organization: author.organization || '',
              articlesFound: searchResponse.articles.length,
              relevantArticles: relevantArticles.length,
              averageRelevanceScore: Math.round(averageRelevanceScore * 10) / 10,
              mostRecentArticle,
              topicsWrittenAbout,
              articles: articlesWithRelevance
            });

            logger.info(`✅ Found ${searchResponse.articles.length} articles by ${author.name}`, {
              articlesFound: searchResponse.articles.length,
              relevantArticles: relevantArticles.length,
              averageRelevance: Math.round(averageRelevanceScore),
              searchMethod: 'Direct author field search'
            });
          } else {
            logger.info(`❌ No articles found for ${author.name} using direct author search`);
          }

        } catch (authorError) {
          logger.error(`💥 Error searching for author ${author.name}`, {
            error: authorError instanceof Error ? authorError.message : 'Unknown',
            authorId: author.id
          });
          continue; // Skip this author and continue with others
        }

        // Small delay between author searches to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Sort authors by number of relevant articles, then by average relevance score
      authorResults.sort((a, b) => {
        if (b.relevantArticles !== a.relevantArticles) {
          return b.relevantArticles - a.relevantArticles;
        }
        return b.averageRelevanceScore - a.averageRelevanceScore;
      });

      const searchResults = {
        topic,
        authorsSearched: authors.length,
        authorsWithArticles,
        totalArticlesFound,
        authorResults,
        searchStrategy: "Direct author field search using author:\"Name\" syntax - fast, accurate, and simple!",
        relevanceAnalysis: "Topic relevance scoring with verified author metadata",
      };

      logger.info('✅ Simplified author search completed', {
        authorsSearched: authors.length,
        authorsWithArticles,
        totalArticlesFound,
        topAuthor: authorResults[0]?.name || 'None',
        topAuthorRelevantArticles: authorResults[0]?.relevantArticles || 0,
        searchMethod: 'Simplified direct author field search',
        performanceImprovement: 'Much faster than previous hybrid approach!'
      });

      return { searchResults };

    } catch (error) {
      logger.error('💥 Error in simplified author search', {
        error: error instanceof Error ? error.message : 'Unknown error',
        authorsCount: authors?.length || 0,
        topic
      });
      throw error;
    }
  }

  /**
   * Calculate topic relevance score for an article (0-100)
   * @param article Article to analyze
   * @param topic Target topic for relevance
   * @returns Relevance score 0-100
   */
  private calculateTopicRelevanceScore(article: Article, topic: string): number {
    const topicLower = topic.toLowerCase();
    const topicKeywords = topicLower.split(/\s+/).filter(word => word.length > 2);
    
    let score = 0;
    const maxScore = 100;
    
    // Check title relevance (40% weight)
    const titleLower = article.title.toLowerCase();
    const titleMatches = topicKeywords.filter(keyword => titleLower.includes(keyword)).length;
    const titleScore = Math.min(40, (titleMatches / topicKeywords.length) * 40);
    score += titleScore;
    
    // Check summary/content relevance (40% weight)
    const contentLower = (article.summary || article.extract || article.content || '').toLowerCase();
    const contentMatches = topicKeywords.filter(keyword => contentLower.includes(keyword)).length;
    const contentScore = Math.min(40, (contentMatches / topicKeywords.length) * 40);
    score += contentScore;
    
    // Check topics array relevance (20% weight)
    const articleTopics = article.topics || [];
    const topicMatches = articleTopics.filter(t => 
      topicKeywords.some(keyword => t.toLowerCase().includes(keyword))
    ).length;
    const topicsScore = Math.min(20, (topicMatches / Math.max(1, articleTopics.length)) * 20);
    score += topicsScore;
    
    return Math.min(maxScore, Math.round(score));
  }

  /**
   * Generate human-readable relevance reason
   * @param article Article being analyzed
   * @param topic Target topic
   * @param score Calculated relevance score
   * @returns Human-readable explanation
   */
  private generateRelevanceReason(article: Article, topic: string, score: number): string {
    if (score >= 80) {
      return `High relevance - article title and content strongly relate to ${topic}`;
    } else if (score >= 60) {
      return `Good relevance - article discusses ${topic} with meaningful coverage`;
    } else if (score >= 40) {
      return `Moderate relevance - article mentions ${topic} but may focus on related topics`;
    } else if (score >= 20) {
      return `Low relevance - article has limited connection to ${topic}`;
    } else {
      return `Minimal relevance - article briefly mentions or tangentially relates to ${topic}`;
    }
  }

  /**
   * Extract main topics from a set of articles
   * @param articles Articles to analyze
   * @returns Array of common topics
   */
  private extractTopicsFromArticles(articles: Article[]): string[] {
    const topicCounts: { [topic: string]: number } = {};
    
    articles.forEach(article => {
      (article.topics || []).forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
    });
    
    // Return top 5 most common topics
    return Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  /**
   * Parse Metabase-specific error codes and messages
   * Based on error codes from official documentation (JSON format)
   */
  private parseMetabaseError(error: any): { code?: number, message: string } {
    if (error.response?.data) {
      try {
        // Try to parse JSON error response
        let errorData = error.response.data;
        
        // If it's a string, try to parse it as JSON
        if (typeof errorData === 'string') {
          try {
            errorData = JSON.parse(errorData);
          } catch {
            // If JSON parsing fails, it might still be XML format
            const messageCodeMatch = errorData.match(/<messageCode>(\d+)<\/messageCode>/);
            const messageMatch = errorData.match(/<message>(.*?)<\/message>/);
            
            if (messageCodeMatch) {
              const code = parseInt(messageCodeMatch[1], 10);
              const knownError = METABASE_ERROR_CODES[code as keyof typeof METABASE_ERROR_CODES];
              const message = messageMatch ? messageMatch[1] : knownError || 'Unknown Metabase error';
              
              return {
                code,
                message: `Metabase Error ${code}: ${message}`
              };
            }
            throw new Error('Not valid JSON or XML');
          }
        }
        
        // Handle JSON error format
        if (errorData.messageCode || errorData.response?.messageCode) {
          const messageCode = errorData.messageCode || errorData.response?.messageCode;
          const message = errorData.message || errorData.userMessage || errorData.response?.message || errorData.response?.userMessage;
          
          const code = parseInt(String(messageCode), 10);
          const knownError = METABASE_ERROR_CODES[code as keyof typeof METABASE_ERROR_CODES];
          const finalMessage = message || knownError || 'Unknown Metabase error';
          
          return {
            code,
            message: `Metabase Error ${code}: ${finalMessage}`
          };
        }
      } catch (parseError) {
        // If JSON/XML parsing fails, fall through to generic error handling
        logger.debug('Could not parse Metabase error response', { parseError: parseError instanceof Error ? parseError.message : 'Unknown' });
      }
    }
    
    return {
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  /**
   * Check rate limiting compliance
   * Based on Python example rate limiting rules
   */
  checkRateLimit(lastCallTime?: Date): { canCall: boolean, waitTime: number } {
    if (!lastCallTime) {
      return { canCall: true, waitTime: 0 };
    }
    
    const timeSinceLastCall = Date.now() - lastCallTime.getTime();
    const minWaitTime = METABASE_RATE_LIMITS.MIN_PAUSE_BETWEEN_CALLS;
    
    if (timeSinceLastCall < minWaitTime) {
      const waitTime = minWaitTime - timeSinceLastCall;
      return { canCall: false, waitTime };
    }
    
    return { canCall: true, waitTime: 0 };
  }

  // =============================================================================
  // UTILITY METHODS - Local business logic, not Metabase API calls
  // =============================================================================

  /**
   * Get compliance workflow status
   * @returns Promise<object> Compliance status information
   */
  async getComplianceStatus(): Promise<any> {
    try {
      logger.info('📋 Checking compliance workflow status');

      // Use real database operations via MetabaseComplianceService
      return await metabaseDBService.getComplianceStatus();
    } catch (error) {
      logger.error('💥 Error checking compliance status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get cache performance statistics
   * @returns Promise<object> Cache performance metrics
   */
  async getCacheStats(): Promise<any> {
    try {
      logger.info('📊 Retrieving cache performance metrics');

      // Get real cache statistics from Redis/cache service
      const cacheStats = await cacheService.getStats();
      
      // Calculate hit rate percentage
      const totalRequests = cacheStats.hits + cacheStats.misses;
      const hitRate = totalRequests > 0 ? (cacheStats.hits / totalRequests) * 100 : 0;
      
      // Get additional sync statistics from database
      const syncStats = await metabaseDBService.getRecentApiCallStats();
      
      const enhancedStats = {
        hitRate: Number(hitRate.toFixed(2)),
        totalRequests,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        errors: cacheStats.errors,
        keysStored: cacheStats.totalKeys,
        memoryUsage: cacheStats.memoryUsage ? `${(cacheStats.memoryUsage / 1024 / 1024).toFixed(2)} MB` : 'N/A',
        memoryUsageBytes: cacheStats.memoryUsage || 0,
        // Add sync statistics
        lastSync: syncStats.lastSync,
        recentArticlesRetrieved: syncStats.articlesRetrieved,
        recentErrors: syncStats.errors,
        lastError: syncStats.lastError
      };

      logger.info('✅ Cache statistics retrieved', enhancedStats);
      return enhancedStats;
    } catch (error) {
      logger.error('💥 Error retrieving cache stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Batch process articles for various operations
   * @param operation Type of operation to perform
   * @param articleIds Array of article IDs to process
   * @returns Promise<object> Processing results
   */
  async batchProcessArticles(operation: string, articleIds: string[]): Promise<any> {
    try {
      logger.info('⚙️ Starting batch processing operation', {
        operation,
        articleCount: articleIds?.length || 0
      });

      // TODO: Implement actual batch processing
      // This should handle different operations on cached articles
      
      const mockResults = {
        operation,
        processed: articleIds?.length || 0,
        successful: articleIds?.length || 0,
        failed: 0,
        results: articleIds?.map(id => ({
          articleId: id,
          status: 'success',
          message: `${operation} completed successfully`
        })) || []
      };

      logger.info('✅ Batch processing completed', {
        operation,
        processed: mockResults.processed
      });
      
      return mockResults;
    } catch (error) {
      logger.error('💥 Error in batch processing', {
        operation,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Analyze locally cached data
   * @param analysisType Type of analysis to perform
   * @param limit Number of results to return
   * @returns Promise<object> Analysis results
   */
  async analyzeLocalData(analysisType: string, limit: number): Promise<any> {
    try {
      logger.info('🔍 Performing local analytics on cached data', {
        analysisType,
        limit
      });

      // Use the dedicated database service for analytics
      return await metabaseDBService.getAnalytics(analysisType, limit);
      
    } catch (error) {
      logger.error('💥 Error in local analytics', {
        analysisType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get daily synchronization status
   * @returns Promise<object> Sync status information
   */
  async getSyncStatus(): Promise<any> {
    try {
      logger.info('🔄 Checking daily sync status');

      // TODO: Implement actual sync status tracking
      // This should track scheduled jobs, sync history, etc.
      
      const mockStatus = {
        lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        syncStatus: 'idle' as const,
        articlesRetrieved: 127,
        nextScheduledSync: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(), // 22 hours from now
        syncDuration: 45000, // ms
        errors: 0,
        lastError: null
      };

      logger.info('✅ Sync status retrieved', mockStatus);
      return mockStatus;
    } catch (error) {
      logger.error('💥 Error checking sync status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process license compliance clicks for articles requiring royalty payments
   * Based on the Python example's callMetabaseArticle function
   * @param articles Array of articles with click URLs and licenses
   * @returns Promise<object> Processing results
   */
  async processComplianceClicks(articles: Array<{ id: string; clickUrl?: string; licenses?: string[] }>): Promise<any> {
    try {
      logger.info('🔗 Starting license compliance click processing', {
        articleCount: articles.length
      });

      const results = [];
      let successful = 0;
      let failed = 0;

      for (const article of articles) {
        if (article.clickUrl && article.licenses && article.licenses.length > 0) {
          try {
            // Make HTTP request to click URL for royalty compliance
            // Using the same approach as the Python example
            const response = await axios.get(article.clickUrl, { 
              timeout: 30000,
              // Disable SSL verification like in Python example
              httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
              })
            });

            successful++;
            results.push({
              articleId: article.id,
              status: 'success',
              message: 'Compliance click successful',
              responseStatus: response.status,
              clickUrl: article.clickUrl,
              licenses: article.licenses
            });

            logger.info(`✅ Compliance click successful for article ${article.id}`, {
              clickUrl: article.clickUrl,
              licenses: article.licenses,
              responseStatus: response.status
            });

          } catch (error) {
            failed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            results.push({
              articleId: article.id,
              status: 'failed',
              message: `Compliance click failed: ${errorMessage}`,
              clickUrl: article.clickUrl,
              licenses: article.licenses,
              error: errorMessage
            });

            logger.error(`❌ Compliance click failed for article ${article.id}`, {
              clickUrl: article.clickUrl,
              licenses: article.licenses,
              error: errorMessage
            });
          }
        } else {
          results.push({
            articleId: article.id,
            status: 'skipped',
            message: 'No click URL or licenses found',
            clickUrl: article.clickUrl,
            licenses: article.licenses
          });
        }
      }

      const summary = {
        total: articles.length,
        successful,
        failed,
        skipped: articles.length - successful - failed,
        results
      };

      logger.info('✅ License compliance processing completed', summary);
      return summary;
      
    } catch (error) {
      logger.error('💥 Error in compliance click processing', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Algorithmic analysis and ranking of articles by metadata scoring (NO AI)
   * SECURITY: Pure algorithmic approach using article metadata - no AI/OpenAI calls
   * @param searchResults Search results from author search
   * @param topic Original topic for relevance calculation
   * @returns Promise<object> Algorithmic analysis results with rankings
   */
  async algorithmicArticleAnalysis(searchResults: any, topic: string): Promise<{
    analysisResults: {
      topic: string;
      analysisDate: string;
      totalAuthorsAnalyzed: number;
      authorsWithRelevantContent: number;
      totalArticlesAnalyzed: number;
      languageFiltered: number;
      rankedAuthors: Array<{
        rank: number;
        authorId: string;
        name: string;
        organization: string;
        algorithmicScore: number;
        editorialRank: number;
        recentRelevantArticles: number;
        totalRecentArticles: number;
        averageRelevanceScore: number;
        relevanceGrade: string;
        mostRecentArticle: string;
        expertiseAreas: string[];
        publicationType: string;
        articleSnippets: Array<{
          title: string;
          summary: string;
          relevanceScore: number;
          publishedAt: string;
          url: string;
          relevanceFactors: string[];
        }>;
        scoreBreakdown: {
          editorial: number;
          topicRelevance: number;
          recency: number;
          sourceQuality: number;
        };
      }>;
      coverageInsights: {
        editorialRankDistribution: Record<string, number>;
        languageDistribution: Record<string, number>;
        topCoveredAspects: string[];
        coverageGaps: string[];
        averageArticlesPerAuthor: number;
        coverageRecency: string;
      };
      methodologyNote: string;
      top10Authors: Array<{
        rank: number;
        name: string;
        organization: string;
        recentRelevantArticles: number;
        averageRelevanceScore: number;
        relevanceGrade: string;
        algorithmicScore: number;
      }>;
    };
  }> {
    try {
      logger.info('🔍 Starting Enhanced Algorithmic Article Analysis', {
        topic,
        totalAuthors: searchResults.authorResults?.length || 0,
        totalArticles: searchResults.authorResults?.reduce((sum: number, author: any) => sum + (author.articles?.length || 0), 0) || 0
      });

      // Extract AI-generated keywords from the workflow for enhanced matching
      const aiKeywords = this.extractAIGeneratedKeywords(searchResults);
      const keywordArray = this.prepareKeywordsForMatching(topic, aiKeywords);

      logger.info('🎯 Enhanced Keywords for Relevance Matching', {
        originalTopic: topic,
        aiGeneratedKeywords: aiKeywords,
        finalKeywordArray: keywordArray,
        keywordCount: keywordArray.length
      });

      // 🔍 DEBUG: Log specific keywords for debugging
      logger.info('🔍 KEYWORD DEBUG - Full Analysis', {
        topic,
        aiKeywords: aiKeywords.map((k: any) => typeof k === 'object' ? k.keyword : k),
        finalKeywordArray: keywordArray,
        keywordTypes: keywordArray.map(k => ({ keyword: k, type: typeof k }))
      });

      if (!searchResults?.authorResults) {
        throw new Error('No author results found in search data');
      }

      // Initialize tracking variables
      let totalArticlesAnalyzed = 0;
      let languageFilteredCount = 0;

      // Process each author's articles
      const authorAnalysisResults = searchResults.authorResults
        .filter((author: any) => author.articles && author.articles.length > 0)
        .map((author: any) => {
          // Filter for English articles first
          const englishArticles = author.articles.filter((article: any) => {
            const isEnglish = this.isEnglishArticle(article);
            if (!isEnglish) {
              // Enhanced debug logging to show specific rejection reasons
              const title = article.title?.substring(0, 100);
              const textToAnalyze = `${article.title || ''} ${article.summary || article.extract || ''}`.trim();
              const nonStandardChar = textToAnalyze.match(/[^\u0020-\u007E\u00A0-\u00FF\u2010-\u2019\u201C-\u201D\u2026\u2013\u2014\s]/);
              
              logger.debug(`LANGUAGE FILTER: Article rejected for ${author.name}`, {
                title,
                reason: 'Failed isEnglishArticle check',
                firstNonStandardChar: nonStandardChar?.[0],
                charCode: nonStandardChar?.[0]?.charCodeAt(0),
                textLength: textToAnalyze.length
              });
            }
            return isEnglish;
          });
          
          languageFilteredCount += (author.articles.length - englishArticles.length);

          if (englishArticles.length === 0) {
            logger.info(`⚠️  Author ${author.name}: No English articles found (${author.articles.length} total articles filtered out)`);
            return null;
          }

          logger.debug(`LANGUAGE FILTER: Author ${author.name}`, {
            totalArticles: author.articles.length,
            englishArticles: englishArticles.length,
            filteredOut: author.articles.length - englishArticles.length
          });

          // Calculate topic relevance for each article using enhanced keywords
          const articlesWithRelevance = englishArticles.map((article: any) => {
            const relevanceScore = this.calculateAdvancedTopicRelevance(article, topic, keywordArray);
            const relevanceFactors = this.getRelevanceFactors(article, topic, keywordArray);
            
            logger.info(`ENHANCED SCORING DEBUG - ${author.name}`, {
              articleTitle: article.title?.substring(0, 100),
              relevanceScore,
              relevanceFactors,
              keywordsUsed: keywordArray.slice(0, 5), // Show first 5 keywords
              languageCheck: 'PASSED'
            });

            return {
              ...article,
              relevanceScore,
              relevanceFactors
            };
          });

          // Calculate author-level metrics
          const relevantArticles = articlesWithRelevance.filter((a: any) => a.relevanceScore >= 15);
          const averageRelevanceScore = articlesWithRelevance.reduce((sum: number, a: any) => sum + a.relevanceScore, 0) / articlesWithRelevance.length;
          
          // Calculate algorithmic score components
          const editorialScore = this.calculateEditorialRankScore(author);
          const topicRelevanceScore = averageRelevanceScore;
          const recencyScore = this.calculateRecencyScore(articlesWithRelevance);
          const sourceQualityScore = this.calculateSourceQualityScore(author);

          // Calculate overall algorithmic score
          const algorithmicScore = (
            (editorialScore * 0.25) +      // 25% editorial rank
            (topicRelevanceScore * 0.35) +  // 35% topic relevance
            (recencyScore * 0.20) +         // 20% recency
            (sourceQualityScore * 0.20)     // 20% source quality
          );

          const relevanceGrade = averageRelevanceScore >= 70 ? 'A' :
                                 averageRelevanceScore >= 60 ? 'B' :
                                 averageRelevanceScore >= 50 ? 'C' :
                                 averageRelevanceScore >= 40 ? 'D' : 'F';

          totalArticlesAnalyzed += englishArticles.length;

          logger.info(`ENHANCED SCORING DEBUG - ${author.name}`, {
            algorithmicScore,
            editorialScore,
            topicRelevanceScore,
            recencyScore,
            sourceQualityScore,
            articleCount: englishArticles.length,
            relevantArticles: relevantArticles.length,
            topScoredArticle: articlesWithRelevance[0] ? {
              title: articlesWithRelevance[0].title?.substring(0, 80),
              score: articlesWithRelevance[0].relevanceScore
            } : 'None'
          });

          // Extract expertise areas from article topics
          const expertiseAreas = this.extractExpertiseAreas(articlesWithRelevance);

          return {
            rank: 0, // Will be set after sorting
            authorId: author.authorId,
            name: author.name,
            organization: author.organization,
            algorithmicScore: Math.round(algorithmicScore * 10) / 10,
            editorialRank: this.extractEditorialRank(author),
            recentRelevantArticles: relevantArticles.length,
            totalRecentArticles: englishArticles.length,
            averageRelevanceScore: Math.round(averageRelevanceScore * 10) / 10,
            relevanceGrade,
            mostRecentArticle: articlesWithRelevance[0]?.publishedAt || '',
            expertiseAreas,
            publicationType: this.determinePublicationType(author.organization),
            articleSnippets: articlesWithRelevance.slice(0, 3).map((article: any) => ({
              title: article.title,
              summary: article.summary,
              relevanceScore: article.relevanceScore,
              publishedAt: article.publishedAt,
              url: article.url,
              relevanceFactors: article.relevanceFactors
            })),
            scoreBreakdown: {
              editorial: Math.round(editorialScore * 0.25),
              topicRelevance: Math.round(topicRelevanceScore * 0.35),
              recency: Math.round(recencyScore * 0.20),
              sourceQuality: Math.round(sourceQualityScore * 0.20)
            }
          };
        })
        .filter((author: any) => author !== null); // Remove null entries

      // Sort authors by algorithmic score
      const rankedAuthors = authorAnalysisResults.sort((a: any, b: any) => b.algorithmicScore - a.algorithmicScore);

      // Add rank numbers
      rankedAuthors.forEach((author: any, index: number) => {
        author.rank = index + 1;
      });

      const authorsWithRelevantContent = rankedAuthors.filter((author: any) => author.recentRelevantArticles > 0).length;

      // Generate insights
      const coverageInsights = this.generateCoverageInsights(rankedAuthors, searchResults.authorResults);

      const analysisResults = {
        topic,
        analysisDate: new Date().toISOString(),
        totalAuthorsAnalyzed: rankedAuthors.length,
        authorsWithRelevantContent,
        totalArticlesAnalyzed,
        languageFiltered: languageFilteredCount,
        rankedAuthors,
        coverageInsights,
        methodologyNote: "Enhanced algorithmic ranking using AI-generated keywords, metadata analysis: editorial rank, topic relevance via indexTerms/semantics/metadata, article recency, and source quality. NO AI used for security compliance.",
        top10Authors: rankedAuthors.slice(0, 10).map((author: any) => ({
          rank: author.rank,
          name: author.name,
          organization: author.organization,
          recentRelevantArticles: author.recentRelevantArticles,
          averageRelevanceScore: author.averageRelevanceScore,
          relevanceGrade: author.relevanceGrade,
          algorithmicScore: author.algorithmicScore
        }))
      };

      logger.info('✅ Enhanced Algorithmic Analysis completed', {
        authorsAnalyzed: rankedAuthors.length,
        articlesAnalyzed: totalArticlesAnalyzed,
        languageFiltered: languageFilteredCount,
        aiKeywordsUsed: aiKeywords.length,
        totalKeywords: keywordArray.length,
        topAuthor: rankedAuthors[0]?.name || 'None',
        topScore: rankedAuthors[0]?.algorithmicScore || 0,
        securityCompliant: 'NO AI used for article analysis'
      });

      return { analysisResults };

    } catch (error) {
      logger.error('💥 Error in algorithmic article analysis', {
        error: error instanceof Error ? error.message : 'Unknown error',
        topic
      });
      throw error;
    }
  }

  /**
   * Check if an article is in English based on language fields and character analysis
   * @param article Article to check
   * @returns boolean indicating if article is in English
   */
  private isEnglishArticle(article: any): boolean {
    const englishIndicators = ['en', 'eng', 'english', 'en-us', 'en-gb'];
    
    // First check explicit language fields
    const languageFields = [
      article.language,
      article.languageCode,
      article.metadata?.language,
      article.metadata?.languageCode,
      article.source?.primaryLanguage
    ];
    
    let hasExplicitLanguage = false;
    for (const field of languageFields) {
      if (field && typeof field === 'string') {
        hasExplicitLanguage = true;
        const lang = field.toLowerCase().trim();
        if (englishIndicators.includes(lang)) {
          return true;
        }
        // If we have explicit non-English language, reject immediately
        if (lang && !englishIndicators.includes(lang)) {
          logger.debug(`Article rejected: explicit non-English language: ${lang}`);
          return false;
        }
      }
    }
    
    // If no explicit language metadata, analyze the content more carefully
    const textToAnalyze = `${article.title || ''} ${article.summary || article.extract || ''}`.trim();
    
    if (!textToAnalyze) {
      logger.debug('Article rejected: no text content to analyze');
      return false;
    }
    
    // HARD REJECT: Check for non-Latin scripts using a simpler, more effective approach
    // Instead of listing every possible non-English character, check if text contains mostly basic Latin + punctuation
    const basicLatinAndPunctuation = /^[\u0020-\u007E\u00A0-\u00FF\u2010-\u2019\u201C-\u201D\u2026\u2013\u2014\s]*$/;
    
    if (!basicLatinAndPunctuation.test(textToAnalyze)) {
      // Find the first non-standard character for debugging
      const nonStandardChar = textToAnalyze.match(/[^\u0020-\u007E\u00A0-\u00FF\u2010-\u2019\u201C-\u201D\u2026\u2013\u2014\s]/);
      logger.debug('Article rejected: contains non-standard characters', {
        title: article.title?.substring(0, 50),
        firstNonStandardChar: nonStandardChar?.[0],
        charCode: nonStandardChar?.[0]?.charCodeAt(0)
      });
      return false;
    }
    
    // Check for excessive non-ASCII characters (but be more lenient than before)
    const nonAsciiCount = (textToAnalyze.match(/[^\x00-\x7F]/g) || []).length;
    const nonAsciiPercentage = (nonAsciiCount / textToAnalyze.length) * 100;
    
    // Only reject if VERY high percentage of non-ASCII (likely foreign language with accents/special chars)
    if (nonAsciiPercentage > 40) {
      logger.debug('Article rejected: very high non-ASCII character percentage', {
        title: article.title?.substring(0, 50),
        nonAsciiPercentage: Math.round(nonAsciiPercentage)
      });
      return false;
    }
    
    // Check for obvious non-English word patterns (but only if no explicit language metadata)
    if (!hasExplicitLanguage) {
      const textLower = textToAnalyze.toLowerCase();
      const strongNonEnglishPatterns = [
        /\b(der|die|das|und|ich|sie|mit|von|zu|auf|bei|nach|vor|über)\b.*\b(der|die|das|und|ich|sie)\b/, // German (multiple words)
        /\b(que|de|la|le|et|dans|pour|avec|sur|par|sans|sous)\b.*\b(que|de|la|le|et)\b/, // French (multiple words)
        /\b(el|la|de|en|con|por|para|del|al|los|las)\b.*\b(el|la|de|en|con)\b/, // Spanish (multiple words)
        /\b(и|в|на|с|по|для|от|до|при|что|это|как)\b.*\b(и|в|на|с|по)\b/ // Russian (multiple words)
      ];
      
      for (const pattern of strongNonEnglishPatterns) {
        if (pattern.test(textLower)) {
          logger.debug('Article rejected: contains strong non-English language patterns', {
            title: article.title?.substring(0, 50),
            pattern: pattern.toString()
          });
          return false;
        }
      }
    }
    
    // Check if source looks like US/English publication
    const source = (article.source || '').toLowerCase();
    const usEnglishSources = [
      'nytimes', 'wsj', 'cnn', 'fox', 'reuters', 'ap news', 'bloomberg', 'usa today',
      'washington post', 'abc news', 'nbc news', 'cbs news', 'npr', 'pbs',
      'techcrunch', 'wired', 'ars technica', 'the verge', 'engadget'
    ];
    
    const isLikelyUSSource = usEnglishSources.some(usSource => source.includes(usSource));
    
    // If no language metadata but appears to be English content, allow it
    if (!hasExplicitLanguage) {
      const looksEnglish = 
        nonAsciiPercentage < 10 && // Low special characters
        textToAnalyze.length > 10 && // Has substantial content
        /[a-zA-Z]/.test(textToAnalyze) && // Contains Latin letters
        (isLikelyUSSource || (textToAnalyze.match(/\b(the|and|of|to|in|for|with|on|at|by|from|as|is|are|was|were|been|have|has|had|will|would|could|should)\b/gi)?.length || 0) > 2); // Common English words
      
      if (looksEnglish) {
        logger.debug('Article accepted: appears to be English based on content analysis', {
          title: article.title?.substring(0, 50),
          textLength: textToAnalyze.length,
          nonAsciiPercentage: Math.round(nonAsciiPercentage),
          isLikelyUSSource
        });
        return true;
      } else {
        logger.debug('Article rejected: does not appear to be English content', {
          title: article.title?.substring(0, 50),
          textLength: textToAnalyze.length,
          nonAsciiPercentage: Math.round(nonAsciiPercentage),
          isLikelyUSSource
        });
        return false;
      }
    }
    
    // If we get here with explicit language metadata but it wasn't English, reject
    logger.debug('Article rejected: has explicit language metadata but not English', {
      title: article.title?.substring(0, 50)
    });
    return false;
  }

  /**
   * Extract AI-generated keywords from the workflow search results
   */
  private extractAIGeneratedKeywords(searchResults: any): string[] {
    try {
      // 🔍 STRONG DEBUG: Log the exact structure to understand the data flow
      logger.info('🔍 EXTRACT KEYWORDS DEBUG - Input structure', {
        searchResultsType: typeof searchResults,
        searchResultsKeys: Object.keys(searchResults || {}),
        hasAiGeneratedKeywords: !!searchResults?.aiGeneratedKeywords,
        aiGeneratedKeywordsType: typeof searchResults?.aiGeneratedKeywords,
        aiGeneratedKeywordsLength: Array.isArray(searchResults?.aiGeneratedKeywords) ? searchResults.aiGeneratedKeywords.length : 'not array',
        aiGeneratedKeywordsPreview: Array.isArray(searchResults?.aiGeneratedKeywords) ? searchResults.aiGeneratedKeywords.slice(0, 3) : searchResults?.aiGeneratedKeywords
      });

      // DEBUG: Log the full structure to see what's available
      logger.info('🔍 DEBUG: extractAIGeneratedKeywords input structure', {
        searchResultsKeys: Object.keys(searchResults || {}),
        hasAiGeneratedKeywords: !!searchResults?.aiGeneratedKeywords,
        hasAuthorResults: !!searchResults?.authorResults,
        hasMetadata: !!searchResults?.metadata,
        hasCollectedInformation: !!searchResults?.collectedInformation,
        hasTargetedKeywords: !!searchResults?.targetedKeywords,
        fullStructure: JSON.stringify(searchResults, null, 2).substring(0, 2000) + '...'
      });

      // Extract keywords from AI Author Generation step if available
      const targetedKeywords = searchResults?.aiGeneratedKeywords || 
                              searchResults?.authorResults?.[0]?.targetedKeywords ||
                              searchResults?.metadata?.targetedKeywords ||
                              searchResults?.collectedInformation?.targetedKeywords ||
                              searchResults?.targetedKeywords ||
                              [];
      
      logger.info('🔍 DEBUG: keyword extraction results', {
        targetedKeywordsFound: !!targetedKeywords,
        targetedKeywordsLength: Array.isArray(targetedKeywords) ? targetedKeywords.length : 0,
        targetedKeywordsType: typeof targetedKeywords,
        targetedKeywordsPreview: Array.isArray(targetedKeywords) ? targetedKeywords.slice(0, 3) : targetedKeywords
      });
      
      if (Array.isArray(targetedKeywords) && targetedKeywords.length > 0) {
        // Extract keyword strings from objects if structured
        const extractedKeywords = targetedKeywords.map((item: any) => {
          if (typeof item === 'string') return item;
          if (item?.keyword) return item.keyword;
          return item?.toString() || '';
        }).filter(k => k.length > 0);
        
        logger.info('✅ Successfully extracted AI keywords', {
          originalCount: targetedKeywords.length,
          extractedCount: extractedKeywords.length,
          extractedKeywords: extractedKeywords.slice(0, 5)
        });
        
        return extractedKeywords;
      }
      
      // FALLBACK: No AI keywords found, return empty array
      logger.warn('❌ No AI-generated keywords found, using empty array', {
        targetedKeywordsFound: !!targetedKeywords,
        targetedKeywordsType: typeof targetedKeywords,
        targetedKeywordsValue: targetedKeywords,
        willFallbackToTopicWords: true
      });
      
      return [];
    } catch (error) {
      logger.warn('Error extracting AI-generated keywords:', error);
      return [];
    }
  }

  /**
   * Prepare keywords for matching by prioritizing full multi-word keywords over individual words
   */
  private prepareKeywordsForMatching(topic: string, aiKeywords: string[]): string[] {
    const fullKeywords = new Set<string>();
    const individualWords = new Set<string>();
    
    // Add AI-generated keywords (prioritize full phrases)
    aiKeywords.forEach(keyword => {
      const cleanKeyword = keyword.toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (cleanKeyword.length > 0) {
        fullKeywords.add(cleanKeyword);
        
        // Also add individual words for fallback matching
        if (cleanKeyword.includes(' ')) {
          cleanKeyword.split(' ').forEach(word => {
            if (word.length > 2) individualWords.add(word);
          });
        }
      }
    });
    
    // Add individual words from topic
    if (topic.includes(' ')) {
      topic.split(' ').forEach(word => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
        if (cleanWord.length > 2) individualWords.add(cleanWord);
      });
    } else {
      const cleanTopic = topic.toLowerCase().replace(/[^\w]/g, '');
      if (cleanTopic.length > 2) individualWords.add(cleanTopic);
    }
    
    // Combine: full keywords first (higher priority), then individual words
    return [...Array.from(fullKeywords), ...Array.from(individualWords)];
  }

  /**
   * Calculate advanced topic relevance using enhanced keywords and metadata
   */
  private calculateAdvancedTopicRelevance(article: any, topic: string, keywords?: string[]): number {
    const keywordArray = keywords || [topic.toLowerCase()];
    
    // Safety check: Immediately return 0 for clearly non-English content (non-Latin scripts only)
    const textToCheck = `${article.title || ''} ${article.summary || ''}`;
    const basicLatinAndPunctuation = /^[\u0020-\u007E\u00A0-\u00FF\u2010-\u2019\u201C-\u201D\u2026\u2013\u2014\s]*$/;
    
    if (!basicLatinAndPunctuation.test(textToCheck)) {
      logger.debug('Relevance scoring: Article contains non-standard characters, returning 0 score', {
        title: article.title?.substring(0, 50)
      });
      return 0;
    }
    
    let totalScore = 0;
    let maxPossibleScore = 0;

    // Text relevance (title + summary) - 40% weight
    const textRelevance = this.calculateTextRelevance(
      `${article.title || ''} ${article.summary || ''}`, 
      keywordArray
    );
    totalScore += textRelevance * 0.40;
    maxPossibleScore += 100 * 0.40;

    // Enhanced metadata relevance - 25% weight
    const metadataRelevance = this.calculateMetadataRelevance(article, keywordArray);
    totalScore += metadataRelevance * 0.25;
    maxPossibleScore += 100 * 0.25;

    // IndexTerms relevance - 20% weight
    if (article.indexTerms && Array.isArray(article.indexTerms)) {
      const indexTermsRelevance = this.calculateIndexTermsRelevance(article.indexTerms, keywordArray);
      totalScore += indexTermsRelevance * 0.20;
    }
    maxPossibleScore += 100 * 0.20;

    // Entities relevance - 10% weight
    if (article.semantics?.entities) {
      const entitiesRelevance = this.calculateEntitiesRelevance(article.semantics.entities, keywordArray);
      totalScore += entitiesRelevance * 0.10;
    }
    maxPossibleScore += 100 * 0.10;

    // Companies relevance - 5% weight
    if (article.companies && Array.isArray(article.companies)) {
      const companiesRelevance = this.calculateCompaniesRelevance(article.companies, keywordArray);
      totalScore += companiesRelevance * 0.05;
    }
    maxPossibleScore += 100 * 0.05;

    const finalScore = Math.min(100, (totalScore / maxPossibleScore) * 100);
    
    return finalScore;
  }

  /**
   * Calculate metadata relevance using industry, source, and topic information
   */
  private calculateMetadataRelevance(article: any, keywords: string[]): number {
    let score = 0;
    
    // Check source metadata
    const source = (article.source || '').toLowerCase();
    keywords.forEach(keyword => {
      if (source.includes(keyword)) score += 20;
    });
    
    // Check topics array
    if (article.topics && Array.isArray(article.topics)) {
      score += this.calculateTopicsArrayRelevance(article.topics, keywords);
    }
    
    // Check for industry-specific metadata
    const metadata = article.metadata || {};
    const metadataText = JSON.stringify(metadata).toLowerCase();
    keywords.forEach(keyword => {
      if (metadataText.includes(keyword)) score += 10;
    });
    
    // Check author organization for industry relevance
    if (article.authorDetails?.organization) {
      const orgText = article.authorDetails.organization.toLowerCase();
      keywords.forEach(keyword => {
        if (orgText.includes(keyword)) score += 15;
      });
    }
    
    return Math.min(100, score);
  }

  /**
   * Get relevance factors with enhanced keyword matching
   */
  private getRelevanceFactors(article: any, topic: string, keywords?: string[]): string[] {
    const keywordArray = keywords || [topic.toLowerCase()];
    const factors: string[] = [];

    // Check title and summary
    const titleText = (article.title || '').toLowerCase();
    const summaryText = (article.summary || '').toLowerCase();
    
    keywordArray.forEach(keyword => {
      if (titleText.includes(keyword)) {
        factors.push(`Title mentions "${keyword}"`);
      }
      if (summaryText.includes(keyword)) {
        factors.push(`Summary mentions "${keyword}"`);
      }
    });

    // Check indexTerms
    if (article.indexTerms && Array.isArray(article.indexTerms)) {
      article.indexTerms.forEach((term: any) => {
        if (term.name) {
          const termName = term.name.toLowerCase();
          keywordArray.forEach(keyword => {
            if (termName.includes(keyword)) {
              factors.push(`Index term: ${term.name}`);
            }
          });
        }
      });
    }

    // Check entities
    if (article.semantics?.entities) {
      article.semantics.entities.forEach((entity: any) => {
        if (entity.value) {
          const entityValue = entity.value.toLowerCase();
          keywordArray.forEach(keyword => {
            if (entityValue.includes(keyword)) {
              factors.push(`Entity: ${entity.value}`);
            }
          });
        }
      });
    }

    // Check companies
    if (article.companies && Array.isArray(article.companies)) {
      article.companies.forEach((company: any) => {
        if (company.name) {
          const companyName = company.name.toLowerCase();
          keywordArray.forEach(keyword => {
            if (companyName.includes(keyword) || this.isIndustryMatch(company.name, keyword)) {
              factors.push(`Company: ${company.name}`);
            }
          });
        }
      });
    }

    // Check metadata and source
    const source = (article.source || '').toLowerCase();
    keywordArray.forEach(keyword => {
      if (source.includes(keyword)) {
        factors.push(`Source relevance: ${keyword}`);
      }
    });

    return factors.slice(0, 5); // Limit to top 5 factors
  }

  // Update the original calculateAdvancedTopicRelevance method signature for backward compatibility
  private calculateTopicRelevance(article: any, topic: string): number {
    return this.calculateAdvancedTopicRelevance(article, topic);
  }

  /**
   * Calculate editorial rank score (Rank 1 = highest score)
   */
  private calculateEditorialRankScore(author: any): number {
    const rank = this.extractEditorialRank(author);
    // Rank 1 = 100, Rank 2 = 80, Rank 3 = 60, Rank 4 = 40, Rank 5+ = 20
    return Math.max(20, (6 - rank) * 20);
  }

  /**
   * Extract editorial rank from various possible locations
   */
  private extractEditorialRank(author: any): number {
    const rank = author.editorialRank || 
                author.metadata?.editorialRank ||
                author.source?.editorialRank ||
                author.metadata?.source?.editorialRank ||
                5; // Default to rank 5
    return parseInt(String(rank)) || 5;
  }

  /**
   * Calculate recency score based on article dates (higher score for recent articles)
   */
  private calculateRecencyScore(articles: any[]): number {
    if (!articles || articles.length === 0) return 0;
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    let totalScore = 0;
    let weightedCount = 0;
    
    articles.forEach(article => {
      const publishedDate = new Date(article.publishedAt || article.estimatedPublishedDate || 0);
      let articleScore = 0;
      
      if (publishedDate > thirtyDaysAgo) {
        // Recent articles get very high score
        articleScore = 90;
      } else if (publishedDate > ninetyDaysAgo) {
        // Moderately recent articles get good score
        articleScore = 70;
      } else if (publishedDate > oneYearAgo) {
        // Older but still recent articles get moderate score
        articleScore = 40;
      } else {
        // Very old articles get low score
        articleScore = 10;
      }
      
      totalScore += articleScore;
      weightedCount++;
    });
    
    // Average the scores, with a bonus for having multiple recent articles
    const averageScore = weightedCount > 0 ? totalScore / weightedCount : 0;
    
    // Bonus for authors with multiple articles in the last 30 days
    const recentArticlesCount = articles.filter(article => {
      const publishedDate = new Date(article.publishedAt || article.estimatedPublishedDate || 0);
      return publishedDate > thirtyDaysAgo;
    }).length;
    
    const volumeBonus = Math.min(recentArticlesCount * 5, 20); // Up to 20 bonus points
    
    return Math.min(100, Math.round(averageScore + volumeBonus));
  }

  /**
   * Calculate source quality score
   */
  private calculateSourceQualityScore(author: any): number {
    let score = 50; // Base score

    // Check organization type
    const org = (author.organization || '').toLowerCase();
    if (org.includes('reuters') || org.includes('bloomberg') || org.includes('wsj') || org.includes('wall street journal')) {
      score += 30; // Premium financial sources
    } else if (org.includes('techcrunch') || org.includes('wired') || org.includes('forbes')) {
      score += 20; // Major tech/business sources
    } else if (org.includes('times') || org.includes('post') || org.includes('news')) {
      score += 15; // General news sources
    }

    return Math.min(100, score);
  }

  /**
   * Extract expertise areas from articles
   */
  private extractExpertiseAreas(articles: any[]): string[] {
    const topicCounts: { [topic: string]: number } = {};
    
    articles.forEach(article => {
      // From topics array
      (article.topics || []).forEach((topic: string) => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
      
      // From index terms
      (article.indexTerms || []).forEach((term: any) => {
        if (term.name) {
          topicCounts[term.name] = (topicCounts[term.name] || 0) + 1;
        }
      });
    });
    
    return Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  /**
   * Determine publication type from organization name
   */
  private determinePublicationType(organization: string): string {
    const org = (organization || '').toLowerCase();
    
    if (org.includes('reuters') || org.includes('bloomberg') || org.includes('wsj')) {
      return 'financial_news';
    } else if (org.includes('techcrunch') || org.includes('wired') || org.includes('ars technica')) {
      return 'tech_news';
    } else if (org.includes('times') || org.includes('post') || org.includes('cnn') || org.includes('bbc')) {
      return 'major_news';
    } else if (org.includes('forbes') || org.includes('business')) {
      return 'business_news';
    } else {
      return 'general_news';
    }
  }

  /**
   * Generate coverage insights from analysis
   */
  private generateCoverageInsights(rankedAuthors: any[], originalAuthors: any[]): any {
    const editorialRankDistribution: { [rank: string]: number } = {};
    const languageDistribution: { [lang: string]: number } = {};
    const allTopics: string[] = [];

    rankedAuthors.forEach(author => {
      // Editorial rank distribution
      const rank = String(author.editorialRank);
      editorialRankDistribution[rank] = (editorialRankDistribution[rank] || 0) + 1;

      // Collect topics
      allTopics.push(...author.expertiseAreas);
    });

    const topCoveredAspects = [...new Set(allTopics)]
      .slice(0, 5);

    const averageArticles = rankedAuthors.length > 0 
      ? rankedAuthors.reduce((sum, a) => sum + a.totalRecentArticles, 0) / rankedAuthors.length 
      : 0;

    return {
      editorialRankDistribution,
      languageDistribution: { 'English': rankedAuthors.length },
      topCoveredAspects,
      coverageGaps: ['Identify gaps based on topic analysis'],
      averageArticlesPerAuthor: Math.round(averageArticles * 10) / 10,
      coverageRecency: 'Analysis focused on recent articles within 90 days'
    };
  }

  // Helper methods for advanced relevance calculation

  private calculateTextRelevance(text: string, keywords: string[]): number {
    if (!text) return 0;
    const textLower = text.toLowerCase();
    
    let score = 0;
    let totalKeywords = keywords.length;
    const matchDetails: string[] = [];
    
    keywords.forEach(keyword => {
      // 1. Exact match (full score)
      if (textLower.includes(keyword)) {
        score += 100;
        matchDetails.push(`exact:${keyword}`);
        return;
      }
      
      // 2. Partial/fuzzy matches (reduced score)
      // Check for partial word matches (min 3 chars)
      if (keyword.length >= 4) {
        const partial = keyword.substring(0, Math.floor(keyword.length * 0.75));
        if (textLower.includes(partial)) {
          score += 60;
          matchDetails.push(`partial:${partial}`);
          return;
        }
      }
      
      // 3. Word boundaries and variants
      const wordBoundaryRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (wordBoundaryRegex.test(text)) {
        score += 30;
        matchDetails.push(`boundary:${keyword}`);
        return;
      }
    });
    
    // Average the score and add a minimum baseline if any text exists
    const averageScore = totalKeywords > 0 ? score / totalKeywords : 0;
    
    // Add small baseline score for having content (helps prevent all-zero scenarios)
    const baselineScore = text.length > 10 ? 5 : 0;

    const finalScore = Math.min(100, Math.round(averageScore + baselineScore));
    
    // 🔍 DEBUG: Log detailed keyword matching
    if (matchDetails.length > 0 || finalScore > 20) {
      logger.info('🔍 TEXT RELEVANCE DEBUG', {
        textPreview: text.substring(0, 150) + '...',
        keywords: keywords.slice(0, 3),
        matchDetails,
        rawScore: score,
        averageScore,
        finalScore,
        totalKeywords
      });
    }
    
    return finalScore;
  }

  private calculateIndexTermsRelevance(indexTerms: any[], keywords: string[]): number {
    if (!indexTerms.length) return 0;
    
    let score = 0;
    let maxPossibleScore = 0;
    
    indexTerms.forEach(term => {
      const termName = (term.name || '').toLowerCase();
      const termScore = term.score || 50; // LexisNexis confidence score
      maxPossibleScore += termScore;
      
      keywords.forEach(keyword => {
        // 1. Exact match (full weight)
        if (termName.includes(keyword)) {
          score += termScore;
          return;
        }
        
        // 2. Partial match (75% weight)
        if (keyword.length >= 4) {
          const partial = keyword.substring(0, Math.floor(keyword.length * 0.75));
          if (termName.includes(partial)) {
            score += termScore * 0.75;
            return;
          }
        }
        
        
        // 4. Word boundary match (40% weight)
        const wordBoundaryRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (wordBoundaryRegex.test(termName)) {
          score += termScore * 0.4;
          return;
        }
      });
    });
    
    // Normalize score and add baseline
    const normalizedScore = maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;
    
    // Add small baseline if we have terms but no matches (helps prevent all-zero)
    const baselineScore = indexTerms.length > 0 && normalizedScore === 0 ? 3 : 0;
    
    return Math.min(100, Math.round(normalizedScore + baselineScore));
  }

  private calculateEntitiesRelevance(entities: any[], keywords: string[]): number {
    if (!entities.length) return 0;
    
    let score = 0;
    let maxPossibleScore = 0;
    
    entities.forEach(entity => {
      const entityValue = (entity.value || '').toLowerCase();
      const entityScore = entity.relevance || 50; // Entity relevance score
      maxPossibleScore += entityScore;
      
      keywords.forEach(keyword => {
        // 1. Exact match (full weight)
        if (entityValue.includes(keyword)) {
          score += entityScore;
          return;
        }
        
        // 2. Partial match (70% weight)
        if (keyword.length >= 4) {
          const partial = keyword.substring(0, Math.floor(keyword.length * 0.75));
          if (entityValue.includes(partial)) {
            score += entityScore * 0.7;
            return;
          }
        }
        
        
        // 4. Word boundary match (40% weight)
        const wordBoundaryRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (wordBoundaryRegex.test(entityValue)) {
          score += entityScore * 0.4;
          return;
        }
      });
    });
    
    // Normalize and add baseline
    const normalizedScore = maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;
    
    // Add baseline if we have entities but no matches
    const baselineScore = entities.length > 0 && normalizedScore === 0 ? 2 : 0;
    
    return Math.min(100, Math.round(normalizedScore + baselineScore));
  }

  private calculateCompaniesRelevance(companies: any[], keywords: string[]): number {
    if (!companies.length) return 0;
    
    let score = 0;
    let maxPossibleScore = companies.length * 50; // Max possible score
    
    companies.forEach(company => {
      const companyName = (company.name || '').toLowerCase();
      const mentions = (company.titleCount || 0) + (company.contentCount || 0);
      const mentionWeight = Math.min(50, mentions * 5); // Cap at 50
      
      keywords.forEach(keyword => {
        // 1. Exact match (full weight)
        if (companyName.includes(keyword)) {
          score += mentionWeight;
          return;
        }
        
        // 2. Partial match (60% weight)
        if (keyword.length >= 4) {
          const partial = keyword.substring(0, Math.floor(keyword.length * 0.75));
          if (companyName.includes(partial)) {
            score += mentionWeight * 0.6;
            return;
          }
        }
        
        // 3. Industry-specific terms (30% weight)
        if (this.isIndustryMatch(companyName, keyword)) {
          score += mentionWeight * 0.3;
          return;
        }
      });
    });
    
    // Normalize and add baseline
    const normalizedScore = maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;
    
    // Add baseline if we have companies but no keyword matches
    const baselineScore = companies.length > 0 && normalizedScore === 0 ? 2 : 0;
    
    return Math.min(100, Math.round(normalizedScore + baselineScore));
  }

  private isIndustryMatch(companyName: string, keyword: string): boolean {
    const industryTerms: Record<string, string[]> = {
      'robotics': ['tech', 'technology', 'robot', 'automation', 'systems', 'labs', 'inc', 'corp'],
      'fundraising': ['capital', 'ventures', 'partners', 'investments', 'fund', 'equity'],
      'startup': ['labs', 'inc', 'corp', 'llc', 'systems', 'solutions'],
      'ai': ['tech', 'intelligence', 'systems', 'labs', 'solutions', 'analytics'],
      'technology': ['tech', 'systems', 'solutions', 'labs', 'software', 'digital']
    };
    
    const terms = industryTerms[keyword.toLowerCase()] || [];
    return terms.some(term => companyName.includes(term));
  }

  private calculateTopicsArrayRelevance(topics: string[], keywords: string[]): number {
    if (!topics.length) return 0;
    
    const matchingTopics = topics.filter(topic =>
      keywords.some(keyword => topic.toLowerCase().includes(keyword))
    );
    
    return Math.min(100, (matchingTopics.length / Math.max(1, topics.length)) * 100);
  }
} 