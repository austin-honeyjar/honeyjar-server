import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import { cacheService, withCache } from './cache.service';

// RocketReach Person Profile Interface
export interface RocketReachPerson {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  current_employer: string;
  current_title: string;
  linkedin_url?: string;
  profile_pic?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  emails?: Array<{
    email: string;
    type: string;
    status: string;
  }>;
  phones?: Array<{
    number: string;
    type: string;
  }>;
  social_media?: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
  work_history?: Array<{
    company_name: string;
    title: string;
    start_date?: string;
    end_date?: string;
  }>;
  education?: Array<{
    school: string;
    degree?: string;
    field_of_study?: string;
    start_date?: string;
    end_date?: string;
  }>;
}

// RocketReach Company Profile Interface
export interface RocketReachCompany {
  id: number;
  name: string;
  domain: string;
  linkedin_url?: string;
  website?: string;
  description?: string;
  industry?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  founded_year?: number;
  employees?: number;
  revenue?: string;
  technology_stack?: string[];
  social_media?: {
    twitter?: string;
    facebook?: string;
    linkedin?: string;
  };
}

// API Response Interfaces
export interface PersonLookupResponse {
  status: string;
  id?: number;
  person?: RocketReachPerson;
  credits_remaining?: number;
  message?: string;
}

export interface PersonSearchResponse {
  status: string;
  total: number;
  offset: number;
  profiles: RocketReachPerson[];
  pagination?: {
    current_page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface CompanySearchResponse {
  status: string;
  total: number;
  offset: number;
  companies: RocketReachCompany[];
  pagination?: {
    current_page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface CompanyLookupResponse {
  status: string;
  company?: RocketReachCompany;
  credits_remaining?: number;
  message?: string;
}

export interface BulkLookupResponse {
  status: string;
  id: string;
  message: string;
  webhook_required: boolean;
  estimated_completion_time?: string;
}

export interface AccountResponse {
  status: string;
  account?: {
    id: number;
    name: string;
    email: string;
    plan: string;
    credits_remaining: number;
    credits_used: number;
    credits_total: number;
    monthly_reset_date: string;
    team_members?: number;
  };
}

// Search and Lookup Parameters
export interface PersonLookupParams {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  current_employer?: string;
  current_title?: string;
  linkedin_url?: string;
  location?: string;
}

export interface PersonSearchParams {
  name?: string;
  current_employer?: string;
  current_title?: string;
  location?: string;
  keyword?: string;
  start?: number;
  size?: number;
}

export interface CompanySearchParams {
  name?: string;
  domain?: string;
  industry?: string;
  location?: string;
  employees_min?: number;
  employees_max?: number;
  revenue_min?: string;
  revenue_max?: string;
  founded_after?: number;
  founded_before?: number;
  start?: number;
  size?: number;
}

export interface CompanyLookupParams {
  name?: string;
  domain?: string;
  linkedin_url?: string;
}

export interface BulkLookupParams {
  lookups: Array<{
    name?: string;
    first_name?: string;
    last_name?: string;
    current_employer?: string;
    current_title?: string;
    email?: string;
    linkedin_url?: string;
  }>;
  webhook_id?: string;
}

// RocketReach API error handling
export const ROCKETREACH_ERROR_CODES = {
  400: 'Bad Request - Invalid parameters',
  401: 'Unauthorized - Invalid API key',
  403: 'Forbidden - Insufficient credits or plan limits',
  404: 'Not Found - Person or company not found',
  422: 'Unprocessable Entity - Invalid data format',
  429: 'Too Many Requests - Rate limit exceeded',
  500: 'Internal Server Error',
  503: 'Service Unavailable'
} as const;

interface RocketReachContact {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  currentEmployer?: string;
  email?: string;
  personalEmail?: string;
  workEmail?: string;
  phone?: string;
  personalPhone?: string;
  workPhone?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  profileUrl?: string;
}

interface RocketReachSearchResult {
  profiles: RocketReachContact[];
  totalCount: number;
  hasMore: boolean;
}

interface EnrichedContact {
  authorId: string;
  name: string;
  title?: string;
  organization?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  twitter?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'rocketreach' | 'database' | 'fallback';
  enrichmentScore: number;
}

export class RocketReachService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;
  private rateLimitDelay = 1000; // 1 second between requests

  constructor() {
    this.apiKey = process.env.ROCKETREACH_API_KEY || '';
    this.baseUrl = process.env.ROCKETREACH_BASE_URL || 'https://api.rocketreach.co';
    
    logger.info('🚀 Initializing RocketReachService', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey.length,
      baseUrl: this.baseUrl
    });
    
    if (!this.apiKey) {
      logger.warn('RocketReach API key not configured. Contact enrichment will use fallback methods.');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Api-Key': this.apiKey
      },
    });

    logger.info('🌐 RocketReach Axios client created', {
      baseURL: this.baseUrl,
      timeout: 30000
    });

    // Add request/response interceptors for detailed logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info('🚀 RocketReach API request starting', {
          method: config.method?.toUpperCase(),
          url: config.url,
          fullUrl: `${config.baseURL}${config.url}`,
          params: config.params,
          hasApiKey: !!config.headers?.['Api-Key']
        });
        return config;
      },
      (error) => {
        logger.error('❌ RocketReach API request error', { 
          error: error.message,
          stack: error.stack 
        });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info('✅ RocketReach API response received', {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          fullUrl: `${response.config.baseURL}${response.config.url}`,
          contentType: response.headers['content-type']
        });
        return response;
      },
      (error) => {
        logger.error('❌ RocketReach API response error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          url: error.config?.url,
          fullUrl: error.config?.baseURL + error.config?.url,
          responseData: error.response?.data
        });
        return Promise.reject(error);
      }
    );

    logger.info('✅ RocketReachService initialization completed successfully');
  }

  /**
   * Get account details and usage information
   */
  async getAccount(userId?: string): Promise<AccountResponse> {
    try {
      const cacheKey = this.generateCacheKey('account', {});
      
      logger.info('📋 Fetching RocketReach account details', {
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      return await withCache(
        cacheKey,
        () => this.fetchAccountFromAPI(userId),
        { ttl: 300 } // 5 minutes cache
      );
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error in getAccount method', {
        error: errorInfo.message,
        statusCode: errorInfo.statusCode,
        hasApiKey: !!this.apiKey
      });
      throw error;
    }
  }

  /**
   * Lookup a person by various identifiers
   */
  async lookupPerson(params: PersonLookupParams, userId?: string): Promise<PersonLookupResponse> {
    try {
      const cacheKey = this.generateCacheKey('person-lookup', params);
      
      logger.info('🔍 Looking up person via RocketReach API', {
        hasName: !!(params.name || (params.first_name && params.last_name)),
        hasEmail: !!params.email,
        hasEmployer: !!params.current_employer,
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      return await withCache(
        cacheKey,
        () => this.fetchPersonLookupFromAPI(params, userId),
        { ttl: 3600 } // 1 hour cache for person lookups
      );
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error in lookupPerson method', {
        params,
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  /**
   * Check the status of a person lookup request
   */
  async checkPersonLookupStatus(lookupId: string): Promise<PersonLookupResponse> {
    try {
      logger.info('⏱️ Checking person lookup status', { lookupId });

      const response = await this.client.get('/api/v2/person/checkStatus', {
        params: { id: lookupId }
      });

      return response.data;
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error checking person lookup status', {
        lookupId,
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  /**
   * Search for people by criteria
   */
  async searchPeople(params: PersonSearchParams): Promise<PersonSearchResponse> {
    try {
      const cacheKey = this.generateCacheKey('person-search', params);
      
      logger.info('🔍 Searching people via RocketReach API', {
        searchTerms: Object.keys(params).filter(key => params[key as keyof PersonSearchParams]),
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      return await withCache(
        cacheKey,
        () => this.fetchPersonSearchFromAPI(params),
        { ttl: 1800 } // 30 minutes cache for searches
      );
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error in searchPeople method', {
        params,
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  /**
   * Bulk lookup multiple people
   */
  async bulkLookup(params: BulkLookupParams): Promise<BulkLookupResponse> {
    try {
      logger.info('📦 Starting bulk lookup via RocketReach API', {
        lookupCount: params.lookups.length,
        hasWebhook: !!params.webhook_id
      });

      const response = await this.client.post('/api/v2/bulkLookup', params);

      logger.info('✅ Bulk lookup request submitted', {
        requestId: response.data.id,
        status: response.data.status
      });

      return response.data;
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error in bulkLookup method', {
        lookupCount: params.lookups.length,
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  /**
   * Combined person and company lookup
   */
  async lookupPersonAndCompany(params: PersonLookupParams): Promise<any> {
    try {
      const cacheKey = this.generateCacheKey('person-company-lookup', params);
      
      logger.info('🔍 Looking up person and company via RocketReach API', {
        params,
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      return await withCache(
        cacheKey,
        () => this.fetchPersonCompanyLookupFromAPI(params),
        { ttl: 3600 } // 1 hour cache
      );
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error in lookupPersonAndCompany method', {
        params,
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  /**
   * Search for companies by criteria
   */
  async searchCompanies(params: CompanySearchParams): Promise<CompanySearchResponse> {
    try {
      const cacheKey = this.generateCacheKey('company-search', params);
      
      logger.info('🏢 Searching companies via RocketReach API', {
        searchTerms: Object.keys(params).filter(key => params[key as keyof CompanySearchParams]),
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      return await withCache(
        cacheKey,
        () => this.fetchCompanySearchFromAPI(params),
        { ttl: 1800 } // 30 minutes cache
      );
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error in searchCompanies method', {
        params,
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  /**
   * Lookup a company by various identifiers
   */
  async lookupCompany(params: CompanyLookupParams): Promise<CompanyLookupResponse> {
    try {
      const cacheKey = this.generateCacheKey('company-lookup', params);
      
      logger.info('🏢 Looking up company via RocketReach API', {
        hasName: !!params.name,
        hasDomain: !!params.domain,
        hasLinkedIn: !!params.linkedin_url,
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      return await withCache(
        cacheKey,
        () => this.fetchCompanyLookupFromAPI(params),
        { ttl: 3600 } // 1 hour cache
      );
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error in lookupCompany method', {
        params,
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  // =============================================================================
  // PRIVATE API METHODS
  // =============================================================================

  private async fetchAccountFromAPI(userId?: string): Promise<AccountResponse> {
    logger.info('🌐 Fetching account from RocketReach API (cache miss)');

    const startTime = Date.now();
    const response = await this.client.get('/api/v2/account/');
    
    // Log the API call to database for analytics
    await this.logApiCall('/api/v2/account/', {}, response.data, 0, startTime, userId); // Account calls don't use credits
    
    return response.data;
  }

  private async fetchPersonLookupFromAPI(params: PersonLookupParams, userId?: string): Promise<PersonLookupResponse> {
    logger.info('🌐 Fetching person lookup from RocketReach API (cache miss)', { params });

    const startTime = Date.now();
    const response = await this.client.get('/api/v2/person/lookup', { params });
    
    // Log the API call to database for analytics
    await this.logApiCall('/api/v2/person/lookup', params, response.data, 1, startTime, userId);
    
    // Store person data if lookup was successful
    if (response.data.status === 'success' && response.data) {
      try {
        const { RocketReachDBService } = await import('./rocketreachDB.service');
        const dbService = new RocketReachDBService();
        await dbService.storePerson(response.data, 1);
      } catch (error) {
        logger.warn('Failed to store person data', { error: (error as Error).message });
      }
    }
    
    return response.data;
  }

  private async fetchPersonSearchFromAPI(params: PersonSearchParams, userId?: string): Promise<PersonSearchResponse> {
    logger.info('🌐 Fetching person search from RocketReach API (cache miss)', { params });

    const startTime = Date.now();
    const response = await this.client.post('/api/v2/person/search', params);
    
    // Log the API call to database for analytics
    await this.logApiCall('/api/v2/person/search', params, response.data, 1, startTime, userId);
    
    return response.data;
  }

  private async fetchPersonCompanyLookupFromAPI(params: PersonLookupParams, userId?: string): Promise<any> {
    logger.info('🌐 Fetching person-company lookup from RocketReach API (cache miss)', { params });

    const startTime = Date.now();
    const response = await this.client.get('/api/v2/profile-company/lookup', { params });
    
    // Log the API call to database for analytics
    await this.logApiCall('/api/v2/profile-company/lookup', params, response.data, 2, startTime, userId); // Person + company lookup costs more
    
    return response.data;
  }

  private async fetchCompanySearchFromAPI(params: CompanySearchParams, userId?: string): Promise<CompanySearchResponse> {
    logger.info('🌐 Fetching company search from RocketReach API (cache miss)', { params });

    const startTime = Date.now();
    const response = await this.client.post('/api/v2/searchCompany', params);
    
    // Log the API call to database for analytics
    await this.logApiCall('/api/v2/searchCompany', params, response.data, 1, startTime, userId);
    
    return response.data;
  }

  private async fetchCompanyLookupFromAPI(params: CompanyLookupParams, userId?: string): Promise<CompanyLookupResponse> {
    logger.info('🌐 Fetching company lookup from RocketReach API (cache miss)', { params });

    const startTime = Date.now();
    const response = await this.client.get('/api/v2/company/lookup/', { params });
    
    // Log the API call to database for analytics
    await this.logApiCall('/api/v2/company/lookup/', params, response.data, 1, startTime, userId);
    
    // Store company data if lookup was successful
    if (response.data.status === 'success' && response.data.company) {
      try {
        const { RocketReachDBService } = await import('./rocketreachDB.service');
        const dbService = new RocketReachDBService();
        await dbService.storeCompany(response.data.company, 1);
      } catch (error) {
        logger.warn('Failed to store company data', { error: (error as Error).message });
      }
    }
    
    return response.data;
  }

  /**
   * Parse RocketReach-specific error codes and messages
   */
  private parseRocketReachError(error: any): { statusCode?: number, message: string } {
    if (error.response?.status) {
      const statusCode = error.response.status;
      const knownError = ROCKETREACH_ERROR_CODES[statusCode as keyof typeof ROCKETREACH_ERROR_CODES];
      const message = error.response.data?.message || knownError || 'Unknown RocketReach error';
      
      return {
        statusCode,
        message: `RocketReach Error ${statusCode}: ${message}`
      };
    }
    
    return {
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  /**
   * Create a new API key (requires existing API key)
   */
  async createNewApiKey(): Promise<{ status: string; api_key?: string; message?: string }> {
    try {
      logger.info('🔑 Creating new RocketReach API key');

      const response = await this.client.post('/api/v2/account/key/');
      
      logger.info('✅ New API key created successfully');
      return response.data;
    } catch (error: any) {
      const errorInfo = this.parseRocketReachError(error);
      
      logger.error('💥 Error creating new API key', {
        error: errorInfo.message,
        statusCode: errorInfo.statusCode
      });
      throw error;
    }
  }

  /**
   * Generate a cache key for RocketReach operations
   */
  private generateCacheKey(operation: string, params: any): string {
    // Convert params to a consistent string representation
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}-${params[key]}`)
      .join(':');
    
    return `rocketreach:${operation}:${paramString || 'no-params'}`;
  }

  /**
   * Check credit levels and send alerts if low
   */
  private async checkCreditLevels(accountData: any): Promise<void> {
    if (accountData.lookup_credit_balance) {
      const remaining = accountData.lookup_credit_balance;
      
      // Alert thresholds
      if (remaining <= 5) {
        logger.warn('🚨 CRITICAL: RocketReach credits very low', {
          remaining,
          threshold: 'critical'
        });
        // TODO: Send email/Slack alert
      } else if (remaining <= 20) {
        logger.warn('⚠️ WARNING: RocketReach credits low', {
          remaining,
          threshold: 'warning'  
        });
        // TODO: Send notification
      }
    }
  }

  /**
   * Store API call with credit usage in database
   */
  private async logApiCall(endpoint: string, params: any, response: any, credits: number = 1, startTime: number = Date.now(), userId?: string): Promise<void> {
    try {
      const responseTime = Date.now() - startTime;
      
      const logData = {
        callType: this.getCallTypeFromEndpoint(endpoint),
        endpoint,
        parameters: params,
        responseStatus: response.status === 'success' ? 200 : (response.error_code ? parseInt(response.error_code) : 500),
        responseTime,
        creditsUsed: credits,
        creditsRemaining: response.lookup_credit_balance || response.credits_remaining,
        userId: userId || 'system', // Use provided userId or fallback to 'system'
        errorMessage: response.status !== 'success' ? response.message || response.error : undefined,
        metadata: {
          rocketReachId: response.id,
          profileId: response.profile_list?.id,
          recordsReturned: response.profiles?.length || (response.person ? 1 : 0) || (response.company ? 1 : 0) || 0
        }
      };

      // Use the RocketReachDBService to log the API call
      const { RocketReachDBService } = await import('./rocketreachDB.service');
      const dbService = new RocketReachDBService();
      await dbService.logApiCall(logData);
      
      logger.info('📊 RocketReach API call logged to database', {
        callType: logData.callType,
        creditsUsed: logData.creditsUsed,
        responseTime: logData.responseTime,
        userId: logData.userId,
        success: logData.responseStatus === 200
      });
    } catch (error) {
      logger.error('💥 Failed to log RocketReach API call', { 
        endpoint,
        error: (error as Error).message 
      });
    }
  }

  /**
   * Determine call type from endpoint for logging
   */
  private getCallTypeFromEndpoint(endpoint: string): string {
    if (endpoint.includes('/account')) return 'account';
    if (endpoint.includes('/person/lookup')) return 'person_lookup';
    if (endpoint.includes('/person/search')) return 'person_search';
    if (endpoint.includes('/company/lookup')) return 'company_lookup';
    if (endpoint.includes('/company/search')) return 'company_search';
    if (endpoint.includes('/bulk')) return 'bulk_lookup';
    return 'person_lookup'; // default
  }

  /**
   * Search for a contact by name and organization
   */
  async searchContact(name: string, organization?: string): Promise<RocketReachContact | null> {
    if (!this.apiKey) {
      logger.warn('RocketReach API key not available, skipping search', { name, organization });
      return null;
    }

    try {
      await this.enforceRateLimit();

      const searchParams: any = {
        name: name,
        current_employer: organization,
        start: 0,
        size: 5 // Get top 5 results
      };

      const response = await this.client.get('/search', {
        params: searchParams
      });

      if (response.data?.profiles && response.data.profiles.length > 0) {
        // Return the best match (first result)
        return response.data.profiles[0];
      }

      return null;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          logger.warn('RocketReach rate limit exceeded', { name, organization });
          // Increase delay for next request
          this.rateLimitDelay = Math.min(this.rateLimitDelay * 2, 10000);
        } else if (error.response?.status === 401) {
          logger.error('RocketReach API authentication failed');
        } else {
          logger.error('RocketReach API error', { 
            status: error.response?.status,
            message: error.message,
            name,
            organization
          });
        }
      } else {
        logger.error('Unexpected error in RocketReach search', { error: (error as Error).message });
      }
      return null;
    }
  }

  /**
   * Enrich contact information for multiple authors
   */
  async enrichContacts(authors: Array<{
    id: string;
    name: string;
    organization?: string;
    email?: string;
    relevanceScore: number;
    articleCount: number;
    topics: string[];
  }>): Promise<EnrichedContact[]> {
    const enrichedContacts: EnrichedContact[] = [];

    for (const author of authors) {
      try {
        const enrichedContact = await this.enrichSingleContact(author);
        if (enrichedContact) {
          enrichedContacts.push(enrichedContact);
        }
      } catch (error) {
        logger.error('Failed to enrich contact', {
          authorId: author.id,
          name: author.name,
          error: (error as Error).message
        });
        
        // Add fallback contact info
        enrichedContacts.push({
          authorId: author.id,
          name: author.name,
          organization: author.organization,
          email: author.email,
          confidence: 'low',
          source: 'database',
          enrichmentScore: 1.0
        });
      }
    }

    return enrichedContacts;
  }

  /**
   * Enrich a single contact
   */
  private async enrichSingleContact(author: {
    id: string;
    name: string;
    organization?: string;
    email?: string;
    relevanceScore: number;
  }): Promise<EnrichedContact | null> {
    
    const rocketReachContact = await this.searchContact(author.name, author.organization);
    
    if (rocketReachContact) {
      return {
        authorId: author.id,
        name: rocketReachContact.name || author.name,
        title: rocketReachContact.title,
        organization: rocketReachContact.currentEmployer || author.organization,
        email: rocketReachContact.workEmail || rocketReachContact.email || author.email,
        phone: rocketReachContact.workPhone || rocketReachContact.phone,
        linkedin: rocketReachContact.linkedin,
        twitter: rocketReachContact.twitter,
        confidence: this.calculateConfidence(rocketReachContact, author),
        source: 'rocketreach',
        enrichmentScore: this.calculateEnrichmentScore(rocketReachContact)
      };
    }

    // Fallback to database information
    return {
      authorId: author.id,
      name: author.name,
      organization: author.organization,
      email: author.email,
      confidence: author.email ? 'medium' : 'low',
      source: 'database',
      enrichmentScore: author.email ? 5.0 : 1.0
    };
  }

  /**
   * Calculate confidence level based on match quality
   */
  private calculateConfidence(
    rocketReachContact: RocketReachContact, 
    author: { name: string; organization?: string }
  ): 'high' | 'medium' | 'low' {
    let score = 0;

    // Name match quality
    if (rocketReachContact.name?.toLowerCase() === author.name.toLowerCase()) {
      score += 3;
    } else if (rocketReachContact.name?.toLowerCase().includes(author.name.toLowerCase())) {
      score += 2;
    } else {
      score += 1;
    }

    // Organization match
    if (author.organization && rocketReachContact.currentEmployer) {
      if (rocketReachContact.currentEmployer.toLowerCase().includes(author.organization.toLowerCase())) {
        score += 2;
      }
    }

    // Contact info completeness
    if (rocketReachContact.email || rocketReachContact.workEmail) score += 1;
    if (rocketReachContact.phone || rocketReachContact.workPhone) score += 1;
    if (rocketReachContact.linkedin) score += 1;

    if (score >= 6) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  }

  /**
   * Calculate enrichment score based on available contact information
   */
  private calculateEnrichmentScore(contact: RocketReachContact): number {
    let score = 0;
    
    if (contact.email || contact.workEmail) score += 3;
    if (contact.phone || contact.workPhone) score += 2;
    if (contact.linkedin) score += 2;
    if (contact.twitter) score += 1;
    if (contact.title) score += 1;
    if (contact.currentEmployer) score += 1;

    return score;
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, this.rateLimitDelay);
    });
  }

  /**
   * Get API status and usage information
   */
  async getApiStatus(): Promise<{
    available: boolean;
    rateLimitDelay: number;
    message: string;
  }> {
    return {
      available: !!this.apiKey,
      rateLimitDelay: this.rateLimitDelay,
      message: this.apiKey 
        ? 'RocketReach API configured and available'
        : 'RocketReach API key not configured'
    };
  }
}

export type { EnrichedContact }; 