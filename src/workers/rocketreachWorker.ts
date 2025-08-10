import { queues, concurrencyLimits, RocketReachJobData } from '../services/comprehensiveQueues';
import logger from '../utils/logger';

// Import your existing RocketReach service
let RocketReachService: any;
let rocketReachService: any;

// Lazy load to avoid circular dependencies
const getRocketReachService = async () => {
  if (!RocketReachService) {
    const module = await import('../services/rocketreach.service');
    RocketReachService = module.RocketReachService;
    rocketReachService = new RocketReachService();
  }
  return rocketReachService;
};

// Process RocketReach contact enrichment
queues.rocketreach.process('contact-enrichment', concurrencyLimits.rocketreach, async (job) => {
  const startTime = Date.now();
  const { contacts, workflowType, userId, orgId } = job.data as RocketReachJobData;
  
  try {
    logger.info(`🚀 Processing RocketReach enrichment for user ${userId}`, {
      contactsCount: contacts?.length || 0,
      workflowType,
      orgId: orgId?.substring(0, 8),
    });

    if (!contacts || contacts.length === 0) {
      throw new Error('No contacts provided for enrichment');
    }

    job.progress(10);

    // Get RocketReach service
    const service = await getRocketReachService();
    job.progress(15);

    const enrichedContacts = [];
    let successfulEnrichments = 0;
    let apiCallCount = 0;
    
    // Process contacts with rate limiting
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      try {
        logger.debug(`Enriching contact ${i + 1}/${contacts.length}:`, {
          name: contact.name,
          organization: contact.organization,
        });

        // Use existing RocketReach service method
        const enriched = await service.enrichContact({
          name: contact.name,
          organization: contact.organization || contact.company,
          email: contact.email,
          linkedin: contact.linkedin,
        }, userId);

        enrichedContacts.push({
          ...contact,
          ...enriched,
          enrichmentSource: 'rocketreach',
          enrichedAt: new Date().toISOString(),
          originalRank: i + 1,
        });

        successfulEnrichments++;
        apiCallCount++;
        
      } catch (contactError) {
        logger.warn(`Contact enrichment failed for ${contact.name}:`, {
          error: contactError.message,
          contactIndex: i + 1,
        });
        
        // Add fallback contact data
        enrichedContacts.push({
          ...contact,
          enrichmentSource: 'fallback',
          enrichmentError: contactError.message,
          enrichedAt: new Date().toISOString(),
          originalRank: i + 1,
          // Add mock enrichment data to maintain compatibility
          email: contact.email || null,
          phone: null,
          linkedin: contact.linkedin || null,
          twitter: null,
          contactConfidence: 'low',
        });
      }

      // Update progress
      job.progress(15 + (70 * (i + 1) / contacts.length));
      
      // Rate limiting between API calls (RocketReach has strict limits)
      if (i < contacts.length - 1) {
        logger.debug('Rate limiting: waiting 1 second before next RocketReach call');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    job.progress(90);

    // Generate enrichment summary
    const enrichmentSummary = {
      totalContacts: contacts.length,
      successfulEnrichments,
      failedEnrichments: contacts.length - successfulEnrichments,
      successRate: Math.round((successfulEnrichments / contacts.length) * 100),
      apiCallsUsed: apiCallCount,
      enrichmentSources: {
        rocketreach: enrichedContacts.filter(c => c.enrichmentSource === 'rocketreach').length,
        fallback: enrichedContacts.filter(c => c.enrichmentSource === 'fallback').length,
      },
    };

    logger.info(`✅ RocketReach enrichment completed for user ${userId}`, {
      ...enrichmentSummary,
      processingTime: Date.now() - startTime,
      workflowType,
    });

    job.progress(100);

    return {
      success: true,
      enrichedContacts,
      summary: enrichmentSummary,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      workflowType,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ RocketReach enrichment failed for user ${userId}:`, {
      error: error.message,
      stack: error.stack,
      processingTime,
      contactsCount: contacts?.length,
      workflowType,
    });

    throw error;
  }
});

// Process individual person lookup
queues.rocketreach.process('person-lookup', concurrencyLimits.rocketreach, async (job) => {
  const startTime = Date.now();
  const { name, organization, email, userId } = job.data as RocketReachJobData;
  
  try {
    logger.info(`🔍 Processing RocketReach person lookup for user ${userId}`, { 
      name, 
      organization 
    });

    job.progress(10);

    // Get RocketReach service
    const service = await getRocketReachService();
    job.progress(30);

    // Perform person lookup
    const result = await service.lookupPerson({
      name,
      current_employer: organization,
      email,
    }, userId);

    job.progress(80);

    logger.info(`✅ RocketReach person lookup completed for user ${userId}`, {
      name,
      found: !!result,
      hasEmail: !!(result?.emails?.length),
      hasPhone: !!(result?.phones?.length),
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      person: result,
      searchCriteria: { name, organization, email },
      processingTime: Date.now() - startTime,
      userId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ RocketReach person lookup failed for user ${userId}:`, {
      error: error.message,
      name,
      organization,
      processingTime,
    });

    throw error;
  }
});

// Process bulk person search
queues.rocketreach.process('bulk-person-search', 1, async (job) => {
  const startTime = Date.now();
  const { searchCriteria, userId, orgId } = job.data;
  
  try {
    logger.info(`🔍 Processing RocketReach bulk search for user ${userId}`, {
      criteriaCount: searchCriteria?.length || 0,
    });

    if (!searchCriteria || searchCriteria.length === 0) {
      throw new Error('No search criteria provided');
    }

    job.progress(10);

    // Get RocketReach service
    const service = await getRocketReachService();
    job.progress(20);

    const searchResults = [];
    let apiCallCount = 0;
    
    // Process searches with strict rate limiting (bulk operations are expensive)
    for (let i = 0; i < searchCriteria.length; i++) {
      const criteria = searchCriteria[i];
      
      try {
        const result = await service.searchPersons(criteria, userId);
        
        searchResults.push({
          criteria,
          result,
          success: true,
          searchedAt: new Date().toISOString(),
        });

        apiCallCount++;
        
      } catch (searchError) {
        logger.warn(`Bulk search failed for criteria ${i + 1}:`, searchError.message);
        
        searchResults.push({
          criteria,
          result: null,
          success: false,
          error: searchError.message,
          searchedAt: new Date().toISOString(),
        });
      }

      // Update progress
      job.progress(20 + (70 * (i + 1) / searchCriteria.length));
      
      // Aggressive rate limiting for bulk operations
      if (i < searchCriteria.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }

    job.progress(95);

    const summary = {
      totalSearches: searchCriteria.length,
      successful: searchResults.filter(r => r.success).length,
      failed: searchResults.filter(r => !r.success).length,
      apiCallsUsed: apiCallCount,
      totalResultsFound: searchResults
        .filter(r => r.success && r.result?.persons)
        .reduce((sum, r) => sum + (r.result.persons.length || 0), 0),
    };

    logger.info(`✅ RocketReach bulk search completed for user ${userId}`, {
      ...summary,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      searchResults,
      summary,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ RocketReach bulk search failed for user ${userId}:`, {
      error: error.message,
      processingTime,
      criteriaCount: searchCriteria?.length,
    });

    throw error;
  }
});

// Process account status check
queues.rocketreach.process('account-status', concurrencyLimits.rocketreach, async (job) => {
  const startTime = Date.now();
  const { userId } = job.data as RocketReachJobData;
  
  try {
    logger.info(`📊 Checking RocketReach account status for user ${userId}`);

    job.progress(20);

    // Get RocketReach service
    const service = await getRocketReachService();
    job.progress(50);

    // Get account information
    const accountInfo = await service.getAccount(userId);
    
    job.progress(80);

    logger.info(`✅ RocketReach account status retrieved for user ${userId}`, {
      creditsRemaining: accountInfo?.credits_remaining,
      plan: accountInfo?.plan,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      accountInfo,
      processingTime: Date.now() - startTime,
      userId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ RocketReach account status check failed for user ${userId}:`, {
      error: error.message,
      processingTime,
    });

    // Don't throw for account status checks - return error info instead
    return {
      success: false,
      accountInfo: null,
      error: error.message,
      processingTime,
      userId,
      timestamp: new Date().toISOString(),
    };
  }
});

// RocketReach worker monitoring events
queues.rocketreach.on('completed', (job) => {
  const duration = Date.now() - job.timestamp;
  const result = job.returnvalue;
  
  logger.info('✅ RocketReach job completed', {
    jobId: job.id,
    jobName: job.name,
    duration: `${duration}ms`,
    success: result?.success,
    contactsProcessed: result?.enrichedContacts?.length || result?.searchResults?.length || 1,
    apiCallsUsed: result?.summary?.apiCallsUsed || 'unknown',
  });
});

queues.rocketreach.on('failed', (job, error) => {
  logger.error('❌ RocketReach job failed', {
    jobId: job.id,
    jobName: job.name,
    error: error.message,
    attempts: job.attemptsMade,
    userId: job.data?.userId?.substring(0, 8),
    contactsCount: job.data?.contacts?.length,
  });

  // Log specific RocketReach API errors for debugging
  if (error.message.includes('rate limit') || error.message.includes('quota')) {
    logger.warn('🚨 RocketReach API limit reached', {
      jobId: job.id,
      error: error.message,
      recommendation: 'Consider implementing longer delays or reducing concurrent requests',
    });
  }
});

queues.rocketreach.on('stalled', (jobId) => {
  logger.warn('⚠️ RocketReach job stalled (likely due to API timeout)', { 
    jobId,
    recommendation: 'Check RocketReach API status and network connectivity',
  });
});

logger.info('🚀 RocketReach API Worker initialized', {
  concurrency: concurrencyLimits.rocketreach,
  queueName: 'rocketreach-api',
  supportedOperations: [
    'contact-enrichment',
    'person-lookup', 
    'bulk-person-search',
    'account-status'
  ],
  rateLimiting: 'Enabled (1-2 second delays between calls)',
});

export { queues as rocketreachQueues };
