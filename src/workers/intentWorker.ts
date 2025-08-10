import { queues, concurrencyLimits, IntentJobData } from '../services/comprehensiveQueues';
import logger from '../utils/logger';

// Import your existing intent service
let intentService: any;

// Lazy load to avoid circular dependencies
const getIntentService = async () => {
  if (!intentService) {
    const { intentService: service } = await import('../services/intent.service');
    intentService = service;
  }
  return intentService;
};

// Process intent classification
queues.intent.process('classify-intent', concurrencyLimits.intent, async (job) => {
  const startTime = Date.now();
  const { 
    userMessage, 
    conversationHistory, 
    currentWorkflow, 
    userId, 
    threadId,
    orgId 
  } = job.data as IntentJobData;
  
  try {
    logger.info(`🧠 Processing intent classification for user ${userId}`, {
      messageLength: userMessage.length,
      hasWorkflow: !!currentWorkflow,
      historyLength: conversationHistory?.length || 0,
      threadId: threadId?.substring(0, 8),
    });

    job.progress(10);

    // Get intent service
    const service = await getIntentService();
    job.progress(20);

    // Get user profile for better classification (if available)
    const userProfile = await getUserProfile(userId, orgId);
    job.progress(30);

    // Prepare classification context
    const classificationContext = {
      userMessage,
      conversationHistory: conversationHistory || [],
      currentWorkflow,
      userProfile,
      availableWorkflows: service.getAvailableWorkflows?.() || [],
    };

    job.progress(50);

    // Perform intent classification
    let intent;
    try {
      intent = await service.classifyIntent(classificationContext);
    } catch (classificationError) {
      logger.warn('Intent classification service error, using fallback', {
        error: classificationError.message,
        userId: userId.substring(0, 8),
      });
      
      // Fallback intent analysis
      intent = await fallbackIntentClassification(userMessage, currentWorkflow);
    }

    job.progress(80);

    // Enhance intent with additional context
    const enhancedIntent = {
      ...intent,
      processingMetadata: {
        processingTime: Date.now() - startTime,
        hasUserProfile: !!userProfile,
        workflowContext: !!currentWorkflow,
        historyLength: conversationHistory?.length || 0,
        fallbackUsed: false,
      },
    };

    job.progress(95);

    logger.info(`✅ Intent classification completed for user ${userId}`, {
      category: intent.category,
      action: intent.action,
      confidence: intent.confidence,
      workflowName: intent.workflowName,
      processingTime: Date.now() - startTime,
      threadId: threadId?.substring(0, 8),
    });

    job.progress(100);

    return {
      success: true,
      intent: enhancedIntent,
      processingTime: Date.now() - startTime,
      userId,
      threadId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Intent classification failed for user ${userId}:`, {
      error: error.message,
      stack: error.stack,
      processingTime,
      threadId: threadId?.substring(0, 8),
    });
    
    // Return fallback intent on error
    const fallbackIntent = await fallbackIntentClassification(userMessage, currentWorkflow);
    
    return {
      success: false,
      intent: {
        ...fallbackIntent,
        processingMetadata: {
          processingTime,
          hasUserProfile: false,
          workflowContext: !!currentWorkflow,
          historyLength: conversationHistory?.length || 0,
          fallbackUsed: true,
          errorMessage: error.message,
        },
      },
      error: error.message,
      processingTime,
      userId,
      threadId,
      timestamp: new Date().toISOString(),
    };
  }
});

/**
 * Get user profile for better intent classification
 */
async function getUserProfile(userId: string, orgId: string) {
  try {
    // This is a simplified version - adapt to your user system
    logger.debug(`Fetching user profile for intent classification`, {
      userId: userId.substring(0, 8),
      orgId: orgId?.substring(0, 8),
    });

    // Mock user profile - replace with actual implementation
    return {
      id: userId,
      preferences: {
        workflowTypes: [],
        communicationStyle: 'professional',
      },
      recentActivity: {
        lastWorkflowType: null,
        commonIntents: [],
      },
      role: 'user',
      orgId,
    };
  } catch (error) {
    logger.warn('Failed to get user profile for intent classification:', error);
    return null;
  }
}

/**
 * Fallback intent classification when main service fails
 */
async function fallbackIntentClassification(userMessage: string, currentWorkflow: any) {
  logger.info('🔄 Using fallback intent classification');

  const message = userMessage.toLowerCase();
  
  // Simple keyword-based intent classification
  let category = 'conversational';
  let action = 'general_conversation';
  let confidence = 0.4; // Lower confidence for fallback
  let workflowName = null;
  let reasoning = 'Fallback classification based on keywords';

  // Workflow-related intents
  if (message.includes('workflow') || message.includes('process') || message.includes('template')) {
    category = 'workflow';
    action = 'workflow_management';
    confidence = 0.5;
    reasoning = 'Detected workflow-related keywords';
  }

  // Content creation intents
  if (message.includes('create') || message.includes('generate') || message.includes('write')) {
    category = 'content_creation';
    action = 'content_generation';
    confidence = 0.6;
    reasoning = 'Detected content creation keywords';
  }

  // Media/PR related intents
  if (message.includes('media') || message.includes('press') || message.includes('journalist')) {
    category = 'media_relations';
    action = 'media_outreach';
    confidence = 0.5;
    workflowName = 'Media Relations';
    reasoning = 'Detected media relations keywords';
  }

  // Data/analytics intents
  if (message.includes('data') || message.includes('analytics') || message.includes('report')) {
    category = 'data_analysis';
    action = 'data_retrieval';
    confidence = 0.5;
    reasoning = 'Detected data analysis keywords';
  }

  // Help/support intents
  if (message.includes('help') || message.includes('how') || message.includes('?')) {
    category = 'support';
    action = 'help_request';
    confidence = 0.7;
    reasoning = 'Detected help/question keywords';
  }

  // If there's a current workflow, bias towards workflow continuation
  if (currentWorkflow) {
    category = 'workflow';
    action = 'workflow_continuation';
    confidence = Math.min(confidence + 0.2, 0.8);
    workflowName = currentWorkflow.templateId || currentWorkflow.name;
    reasoning += ' (biased towards current workflow)';
  }

  return {
    category,
    action,
    confidence,
    reasoning,
    workflowName,
    fallback: true,
  };
}

// Enhanced intent worker with batch processing capability
queues.intent.process('batch-classify-intent', 2, async (job) => {
  const { messages, userId, orgId } = job.data;
  
  try {
    logger.info(`🧠 Processing batch intent classification for user ${userId}`, {
      messagesCount: messages.length,
    });

    const results = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      try {
        // Process each message
        const intent = await fallbackIntentClassification(message.content, message.currentWorkflow);
        
        results.push({
          messageId: message.id,
          intent,
          success: true,
        });

        // Update progress
        job.progress(Math.round(((i + 1) / messages.length) * 100));
        
      } catch (error) {
        results.push({
          messageId: message.id,
          intent: null,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      results,
      totalProcessed: messages.length,
      successfulClassifications: results.filter(r => r.success).length,
      processingTime: Date.now() - job.timestamp,
      userId,
      orgId,
    };

  } catch (error) {
    logger.error(`❌ Batch intent classification failed for user ${userId}:`, error);
    throw error;
  }
});

// Intent worker monitoring events
queues.intent.on('completed', (job) => {
  const duration = Date.now() - job.timestamp;
  logger.info('✅ Intent classification job completed', {
    jobId: job.id,
    jobName: job.name,
    duration: `${duration}ms`,
    attempts: job.attemptsMade,
  });
});

queues.intent.on('failed', (job, error) => {
  logger.error('❌ Intent classification job failed', {
    jobId: job.id,
    jobName: job.name,
    error: error.message,
    attempts: job.attemptsMade,
    data: {
      userId: job.data?.userId?.substring(0, 8),
      messageLength: job.data?.userMessage?.length,
    },
  });
});

queues.intent.on('stalled', (jobId) => {
  logger.warn('⚠️ Intent classification job stalled', { jobId });
});

logger.info('🧠 Intent Classification Worker initialized', {
  concurrency: concurrencyLimits.intent,
  queueName: 'intent-classification',
});

export { queues as intentQueues };
