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

export class RocketReachService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ROCKETREACH_API_KEY || '';
    this.baseUrl = process.env.ROCKETREACH_BASE_URL || 'https://api.rocketreach.co';
    
    logger.info('🚀 Initializing RocketReachService', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey.length,
      baseUrl: this.baseUrl
    });
    
    if (!this.apiKey) {
      logger.error('ROCKETREACH_API_KEY environment variable is missing');
      throw new Error('ROCKETREACH_API_KEY environment variable is required');
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
  async getAccount(): Promise<AccountResponse> {
    try {
      const cacheKey = this.generateCacheKey('account', {});
      
      logger.info('📋 Fetching RocketReach account details', {
        cacheKey,
        hasCache: await cacheService.exists(cacheKey)
      });

      return await withCache(
        cacheKey,
        () => this.fetchAccountFromAPI(),
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
  async lookupPerson(params: PersonLookupParams): Promise<PersonLookupResponse> {
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
        () => this.fetchPersonLookupFromAPI(params),
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

  private async fetchAccountFromAPI(): Promise<AccountResponse> {
    logger.info('🌐 Fetching account from RocketReach API (cache miss)');

    const response = await this.client.get('/api/v2/account/');
    return response.data;
  }

  private async fetchPersonLookupFromAPI(params: PersonLookupParams): Promise<PersonLookupResponse> {
    logger.info('🌐 Fetching person lookup from RocketReach API (cache miss)', { params });

    const response = await this.client.get('/api/v2/person/lookup', { params });
    return response.data;
  }

  private async fetchPersonSearchFromAPI(params: PersonSearchParams): Promise<PersonSearchResponse> {
    logger.info('🌐 Fetching person search from RocketReach API (cache miss)', { params });

    const response = await this.client.post('/api/v2/person/search', params);
    return response.data;
  }

  private async fetchPersonCompanyLookupFromAPI(params: PersonLookupParams): Promise<any> {
    logger.info('🌐 Fetching person-company lookup from RocketReach API (cache miss)', { params });

    const response = await this.client.get('/api/v2/profile-company/lookup', { params });
    return response.data;
  }

  private async fetchCompanySearchFromAPI(params: CompanySearchParams): Promise<CompanySearchResponse> {
    logger.info('🌐 Fetching company search from RocketReach API (cache miss)', { params });

    const response = await this.client.post('/api/v2/searchCompany', params);
    return response.data;
  }

  private async fetchCompanyLookupFromAPI(params: CompanyLookupParams): Promise<CompanyLookupResponse> {
    logger.info('🌐 Fetching company lookup from RocketReach API (cache miss)', { params });

    const response = await this.client.get('/api/v2/company/lookup/', { params });
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
  private async logApiCall(endpoint: string, params: any, response: any, credits: number = 1): Promise<void> {
    try {
      // TODO: Implement database storage
      const logData = {
        callType: this.getCallTypeFromEndpoint(endpoint),
        endpoint,
        parameters: params,
        responseStatus: 200,
        creditsUsed: credits,
        creditsRemaining: response.lookup_credit_balance,
        userId: 'current-user', // TODO: Get from request context
        responseTime: Date.now(),
        metadata: {
          rocketReachId: response.id,
          profileId: response.profile_list?.id
        }
      };
      
      logger.info('📊 RocketReach API call logged', logData);
    } catch (error) {
      logger.error('💥 Failed to log RocketReach API call', { error });
    }
  }

  private getCallTypeFromEndpoint(endpoint: string): string {
    if (endpoint.includes('person/lookup')) return 'person_lookup';
    if (endpoint.includes('person/search')) return 'person_search';
    if (endpoint.includes('company/lookup')) return 'company_lookup';
    if (endpoint.includes('company/search')) return 'company_search';
    if (endpoint.includes('bulkLookup')) return 'bulk_lookup';
    if (endpoint.includes('account')) return 'account';
    return 'unknown';
  }
} 