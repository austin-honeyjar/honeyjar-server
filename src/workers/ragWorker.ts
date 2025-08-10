import { queues, concurrencyLimits, RAGJobData } from '../services/comprehensiveQueues';
import logger from '../utils/logger';

// Import your existing RAG service
let ragService: any;

// Lazy load to avoid circular dependencies
const getRagService = async () => {
  if (!ragService) {
    const { ragService: service } = await import('../services/rag.service');
    ragService = service;
  }
  return ragService;
};

// Process RAG document search
queues.rag.process('document-search', concurrencyLimits.rag, async (job) => {
  const startTime = Date.now();
  const { 
    query, 
    userId, 
    orgId, 
    limit = 5, 
    threshold = 0.7,
    securityLevel = 'internal' 
  } = job.data as RAGJobData;
  
  try {
    logger.info(`📚 Processing RAG document search for user ${userId}`, {
      queryLength: query.length,
      limit,
      threshold,
      securityLevel,
      orgId: orgId?.substring(0, 8),
    });

    job.progress(10);

    // Get RAG service
    const service = await getRagService();
    job.progress(20);

    // Step 1: Generate query embedding (queue to OpenAI worker)
    const embeddingJob = await queues.openai.add('generate-embedding', {
      message: query,
      userId,
      jobType: 'generate-embedding',
    });

    // Wait for embedding generation
    const embeddingResult = await embeddingJob.finished();
    job.progress(40);

    if (!embeddingResult.success) {
      throw new Error('Failed to generate query embedding');
    }

    // Step 2: Perform vector similarity search
    const searchResults = await service.searchSecureContentPgVector(userId, orgId, query, {
      contentTypes: ['conversation', 'rag_document', 'workflow_context'],
      securityLevel,
      limit,
      maxDistance: 1 - threshold, // Convert similarity to distance
      usePgVector: true,
    });

    job.progress(70);

    // Step 3: Enhanced result processing
    const enhancedResults = searchResults.map((doc: any, index: number) => ({
      id: doc.id,
      content: doc.content?.substring(0, 1000) || '', // Truncate for performance
      metadata: doc.metadata || {},
      similarity: doc.similarity || (1 - (doc.distance || 0)),
      rank: index + 1,
      source: doc.source || 'unknown',
      contentType: doc.contentType || 'document',
      securityLevel: doc.securityLevel || securityLevel,
      lastUpdated: doc.updated_at || doc.lastUpdated,
    }));

    job.progress(90);

    // Step 4: Context aggregation for better results
    const aggregatedContext = {
      totalResults: enhancedResults.length,
      topSimilarity: enhancedResults[0]?.similarity || 0,
      avgSimilarity: enhancedResults.length > 0 
        ? enhancedResults.reduce((sum, r) => sum + r.similarity, 0) / enhancedResults.length 
        : 0,
      contentTypes: [...new Set(enhancedResults.map(r => r.contentType))],
      sources: [...new Set(enhancedResults.map(r => r.source))],
    };

    logger.info(`✅ RAG document search completed for user ${userId}`, {
      resultsFound: enhancedResults.length,
      topSimilarity: aggregatedContext.topSimilarity,
      avgSimilarity: Math.round(aggregatedContext.avgSimilarity * 100) / 100,
      contentTypes: aggregatedContext.contentTypes,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      query,
      results: enhancedResults,
      context: aggregatedContext,
      searchParameters: {
        limit,
        threshold,
        securityLevel,
        usedEmbedding: true,
      },
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ RAG document search failed for user ${userId}:`, {
      error: error.message,
      stack: error.stack,
      processingTime,
      queryLength: query.length,
    });

    // Return fallback results
    return {
      success: false,
      query,
      results: [],
      context: {
        totalResults: 0,
        topSimilarity: 0,
        avgSimilarity: 0,
        contentTypes: [],
        sources: [],
        error: error.message,
      },
      error: error.message,
      processingTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };
  }
});

// Process user knowledge retrieval
queues.rag.process('user-knowledge', concurrencyLimits.rag, async (job) => {
  const startTime = Date.now();
  const { userId, orgId, includePreferences = true } = job.data;
  
  try {
    logger.info(`👤 Processing user knowledge retrieval for user ${userId}`, {
      includePreferences,
      orgId: orgId?.substring(0, 8),
    });

    job.progress(10);

    // Get RAG service
    const service = await getRagService();
    job.progress(30);

    // Get user knowledge base
    const userKnowledge = await service.getUserKnowledge(userId, orgId);
    job.progress(70);

    // Enhance with additional context if needed
    let enhancedKnowledge = userKnowledge;
    
    if (includePreferences && userKnowledge) {
      try {
        // Add user preferences and recent activity
        const recentActivity = await getRecentUserActivity(userId, orgId);
        enhancedKnowledge = {
          ...userKnowledge,
          recentActivity,
          enrichmentDate: new Date().toISOString(),
        };
      } catch (enrichmentError) {
        logger.warn('Failed to enhance user knowledge:', enrichmentError.message);
      }
    }

    job.progress(90);

    logger.info(`✅ User knowledge retrieval completed for user ${userId}`, {
      hasKnowledge: !!enhancedKnowledge,
      knowledgeKeys: enhancedKnowledge ? Object.keys(enhancedKnowledge) : [],
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      userKnowledge: enhancedKnowledge,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ User knowledge retrieval failed for user ${userId}:`, {
      error: error.message,
      processingTime,
    });

    throw error;
  }
});

// Process dual RAG context (advanced RAG with multiple sources)
queues.rag.process('dual-rag-context', concurrencyLimits.rag, async (job) => {
  const startTime = Date.now();
  const { 
    userId, 
    orgId, 
    workflowType, 
    stepName, 
    userInput, 
    securityLevel = 'internal' 
  } = job.data;
  
  try {
    logger.info(`🔄 Processing dual RAG context for user ${userId}`, {
      workflowType,
      stepName,
      inputLength: userInput.length,
      securityLevel,
    });

    job.progress(10);

    // Get RAG service
    const service = await getRagService();
    job.progress(20);

    // Get dual RAG context using your existing service method
    const dualRAGContext = await service.getDualRAGContext(
      userId,
      orgId,
      workflowType,
      stepName,
      userInput,
      securityLevel
    );

    job.progress(80);

    // Transform and enhance the context
    const enhancedContext = {
      userDefaults: dualRAGContext.userDefaults,
      globalWorkflowKnowledge: dualRAGContext.globalWorkflowKnowledge,
      organizationContext: dualRAGContext.organizationContext,
      searchMetadata: {
        workflowType,
        stepName,
        securityLevel,
        inputLength: userInput.length,
        processingTime: Date.now() - startTime,
      },
      aggregatedStats: {
        totalSources: [
          ...dualRAGContext.globalWorkflowKnowledge,
          ...dualRAGContext.organizationContext
        ].length,
        userDefaultsCount: dualRAGContext.userDefaults?.length || 0,
        uniqueSources: [...new Set([
          ...dualRAGContext.globalWorkflowKnowledge.map(item => item.source),
          ...dualRAGContext.organizationContext.map(item => item.source)
        ])],
      },
    };

    logger.info(`✅ Dual RAG context completed for user ${userId}`, {
      totalSources: enhancedContext.aggregatedStats.totalSources,
      userDefaultsCount: enhancedContext.aggregatedStats.userDefaultsCount,
      uniqueSources: enhancedContext.aggregatedStats.uniqueSources,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      context: enhancedContext,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Dual RAG context failed for user ${userId}:`, {
      error: error.message,
      processingTime,
      workflowType,
      stepName,
    });

    throw error;
  }
});

// Batch document embedding for content ingestion
queues.rag.process('batch-embed-documents', 2, async (job) => {
  const startTime = Date.now();
  const { documents, userId, orgId } = job.data;
  
  try {
    logger.info(`📚 Processing batch document embedding for user ${userId}`, {
      documentsCount: documents.length,
      totalChars: documents.reduce((sum: number, doc: any) => sum + (doc.content || '').length, 0),
    });

    job.progress(10);

    const results = [];
    
    // Process documents in smaller batches
    const batchSize = 5;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      // Extract text content for embedding
      const texts = batch.map(doc => doc.content || doc.text || '');
      
      // Queue embedding generation
      const embeddingJob = await queues.openai.add('batch-generate-embeddings', {
        texts,
        userId,
      });

      // Wait for embeddings
      const embeddingResult = await embeddingJob.finished();
      
      if (embeddingResult.success) {
        // Process each document with its embedding
        batch.forEach((doc, index) => {
          results.push({
            id: doc.id,
            content: doc.content,
            embedding: embeddingResult.embeddings[index],
            metadata: doc.metadata || {},
            processed: true,
          });
        });
      } else {
        // Handle failed embeddings
        batch.forEach(doc => {
          results.push({
            id: doc.id,
            content: doc.content,
            embedding: null,
            metadata: doc.metadata || {},
            processed: false,
            error: 'Embedding generation failed',
          });
        });
      }

      // Update progress
      job.progress(10 + (80 * (i + batch.length) / documents.length));
      
      // Rate limiting between batches
      if (i + batchSize < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    job.progress(95);

    const successfulEmbeddings = results.filter(r => r.processed).length;
    
    logger.info(`✅ Batch document embedding completed for user ${userId}`, {
      totalDocuments: documents.length,
      successfulEmbeddings,
      failedEmbeddings: documents.length - successfulEmbeddings,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      results,
      totalDocuments: documents.length,
      successfulEmbeddings,
      failedEmbeddings: documents.length - successfulEmbeddings,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Batch document embedding failed for user ${userId}:`, {
      error: error.message,
      processingTime,
      documentsCount: documents.length,
    });

    throw error;
  }
});

// Helper function to get recent user activity
async function getRecentUserActivity(userId: string, orgId: string) {
  try {
    // This would connect to your database to get recent user activity
    // For now, return a mock structure
    return {
      recentQueries: [],
      recentWorkflows: [],
      commonTopics: [],
      lastActivity: new Date().toISOString(),
    };
  } catch (error) {
    logger.warn('Failed to get recent user activity:', error);
    return null;
  }
}

// RAG worker monitoring events
queues.rag.on('completed', (job) => {
  const duration = Date.now() - job.timestamp;
  const result = job.returnvalue;
  
  logger.info('✅ RAG job completed', {
    jobId: job.id,
    jobName: job.name,
    duration: `${duration}ms`,
    resultsCount: result?.results?.length || result?.totalDocuments || 'unknown',
    success: result?.success,
  });
});

queues.rag.on('failed', (job, error) => {
  logger.error('❌ RAG job failed', {
    jobId: job.id,
    jobName: job.name,
    error: error.message,
    attempts: job.attemptsMade,
    userId: job.data?.userId?.substring(0, 8),
    queryLength: job.data?.query?.length,
  });
});

queues.rag.on('stalled', (jobId) => {
  logger.warn('⚠️ RAG job stalled', { jobId });
});

logger.info('📚 RAG Processing Worker initialized', {
  concurrency: concurrencyLimits.rag,
  queueName: 'rag-processing',
  supportedOperations: [
    'document-search',
    'user-knowledge', 
    'dual-rag-context',
    'batch-embed-documents'
  ],
});

export { queues as ragQueues };
