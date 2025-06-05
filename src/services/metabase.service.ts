import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import { cacheService, withCache } from './cache.service';

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
  recent?: boolean; // Search only last 3 days for faster queries
  sequence_id?: string; // Pagination
  filter_duplicates?: boolean; // Remove duplicate articles
  duplicate_order?: 'latest' | 'oldest'; // Which duplicate to show
  sort?: 'asc' | 'desc'; // Sort order, default desc
  relevance_percent?: number; // Filter by relevance 1-100
  sort_by_relevance?: boolean; // Sort by relevance instead of sequenceId
  show_relevance_score?: boolean; // Include relevance scores
  show_matching_keywords?: boolean; // Show matching keywords
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
        ttl: params.recent ? 300 : 900 // 5 minutes for recent, 15 minutes for full search
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
      requestParams.sequenceId = params.sequenceId;
      logger.debug('➕ Added sequenceId parameter for pagination', { sequenceId: params.sequenceId });
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

    logger.info('📥 Raw response received, starting JSON parsing...', {
      responseType: typeof response.data,
      responseLength: response.data?.length || 0,
      requestedLimit: requestParams.limit,
      isGzipped: response.headers['content-encoding'] === 'gzip'
    });

    // Add debug logging to inspect raw JSON structure
    if (response.data && typeof response.data === 'string') {
      // Count potential articles in raw JSON
      const articleMatches = response.data.match(/{\s*"article"\s*:\s*\[/g);
      const articleCount = articleMatches ? articleMatches.length : 0;
      
      logger.info('🔍 DEBUG: Raw JSON analysis', {
        jsonLength: response.data.length,
        articleTagsFound: articleCount,
        jsonPreview: response.data.substring(0, 500) + '...',
        jsonEnd: '...' + response.data.substring(response.data.length - 200)
      });
    }

    // Parse JSON response
    const parsedResponse = response.data;
    
    // Add detailed logging of the parsed structure
    logger.info('🔍 DEBUG: Full parsed structure inspection', {
      parsedKeys: Object.keys(parsedResponse),
      hasResponse: !!parsedResponse,
      responseType: typeof parsedResponse,
      directStructure: JSON.stringify(parsedResponse, null, 2).substring(0, 1000) + '...'
    });
    
    logger.info('🔄 JSON parsing completed, transforming to JSON format...');
    
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
  }

  /**
   * Private method to fetch revoked articles from API (used by cache)
   */
  private async fetchRevokedArticlesFromAPI(params: RevokedArticlesParams): Promise<RevokedArticlesResponse> {
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

    // Parse JSON response
    const parsedResponse = response.data;
    const revokedData = this.transformRevokedArticlesResponse(parsedResponse);

    logger.info('✅ Revoked articles fetched successfully', {
      revokedCount: revokedData.revokedArticles.length,
      nextSequenceId: revokedData.sequenceId
    });

    return revokedData;
  }

  /**
   * Private method to fetch search results from API (used by cache)
   * Implements the Metabase Search API
   */
  private async fetchSearchResultsFromAPI(params: SearchArticlesParams): Promise<ArticleSearchResponse> {
    logger.info('🌐 Fetching search results from Metabase Search API (cache miss)', {
      query: params.query,
      limit: params.limit,
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl
    });

    // Validate limit parameter (search API has different limits)
    let limit = params.limit || 1;
    if (limit < 1 || limit > 200) {
      logger.warn(`⚠️ Invalid search limit ${limit}, defaulting to 1`, {
        requestedLimit: params.limit,
        maxAllowed: 200
      });
      limit = 1;
    }

    // Build request parameters for search API
    const requestParams: any = {
      key: this.apiKey,
      query: params.query, // Required
      limit: limit,
      format: params.format || 'json' // Default to JSON
    };

    // Add optional parameters
    if (params.recent) {
      requestParams.recent = 'true';
      logger.debug('➕ Added recent=true for faster 3-day search');
    }

    if (params.sequence_id) {
      requestParams.sequence_id = params.sequence_id;
      logger.debug('➕ Added sequence_id for pagination', { sequence_id: params.sequence_id });
    }

    if (params.filter_duplicates) {
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
      requestParams.sort_by_relevance = 'true';
      logger.debug('➕ Added sort_by_relevance=true');
    }

    if (params.show_relevance_score) {
      requestParams.show_relevance_score = 'true';
      logger.debug('➕ Added show_relevance_score=true');
    }

    if (params.show_matching_keywords) {
      requestParams.show_matching_keywords = 'true';
      logger.debug('➕ Added show_matching_keywords=true');
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

      // TODO: Implement actual compliance tracking
      // This should check database for last revoked articles sync, etc.
      
      const mockStatus = {
        lastComplianceCheck: new Date().toISOString(),
        revokedArticlesProcessed: 0,
        complianceStatus: 'compliant' as const,
        nextScheduledCheck: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      logger.info('✅ Compliance status retrieved', mockStatus);
      return mockStatus;
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

      // TODO: Implement actual cache statistics from Redis/cache service
      // This should integrate with cacheService to get real metrics
      
      const mockStats = {
        hitRate: 85.5,
        totalRequests: 1247,
        cacheSize: 2048576, // bytes
        averageResponseTime: 45, // ms
        keysStored: 156,
        memoryUsage: '2.1MB'
      };

      logger.info('✅ Cache statistics retrieved', mockStats);
      return mockStats;
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

      // TODO: Implement actual analytics on cached data
      // This should analyze articles stored locally without API calls
      
      let mockResults: any = {
        analysisType,
        dataSource: 'cached_articles',
        generatedAt: new Date().toISOString()
      };

      switch (analysisType) {
        case 'topics':
          mockResults.results = [
            { topic: 'Technology', count: 45, percentage: 23.5 },
            { topic: 'Business', count: 38, percentage: 19.8 },
            { topic: 'Politics', count: 32, percentage: 16.7 }
          ].slice(0, limit);
          break;
        
        case 'sources':
          mockResults.results = [
            { source: 'Reuters', count: 28, percentage: 14.6 },
            { source: 'Associated Press', count: 24, percentage: 12.5 },
            { source: 'BBC News', count: 19, percentage: 9.9 }
          ].slice(0, limit);
          break;
        
        case 'sentiment':
          mockResults.results = {
            positive: 45,
            neutral: 32,
            negative: 23,
            averageScore: 0.12
          };
          break;
        
        case 'timeline':
          mockResults.results = [
            { date: '2025-06-05', articles: 15 },
            { date: '2025-06-04', articles: 22 },
            { date: '2025-06-03', articles: 18 }
          ].slice(0, limit);
          break;
        
        default:
          mockResults.results = [];
      }

      logger.info('✅ Local analytics completed', {
        analysisType,
        resultCount: Array.isArray(mockResults.results) ? mockResults.results.length : 1
      });
      
      return mockResults;
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
} 