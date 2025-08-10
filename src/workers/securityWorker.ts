import { queues, concurrencyLimits, SecurityJobData } from '../services/comprehensiveQueues';
import logger from '../utils/logger';

// Import the real enhanced workflow service
import { EnhancedWorkflowService } from '../services/enhanced-workflow.service';

// Real security service implementation using enhanced workflow service
const getSecurityService = async () => {
  const enhancedService = new EnhancedWorkflowService();
  
  return {
    classifyContent: async (content: string, context?: any) => {
      try {
        // Use the enhanced workflow service's security analysis capabilities
        const securityAnalysis = await enhancedService.analyzeContentSecurity(
          content,
          context?.userId || 'system',
          context?.orgId || ''
        );
        
        return {
          securityLevel: securityAnalysis.securityLevel,
          containsPii: securityAnalysis.piiDetected,
          hasRedaction: securityAnalysis.sensitiveElements.length > 0,
          riskScore: securityAnalysis.securityLevel === 'restricted' ? 0.9 :
                    securityAnalysis.securityLevel === 'confidential' ? 0.7 :
                    securityAnalysis.securityLevel === 'internal' ? 0.3 : 0.1,
          categories: securityAnalysis.securityTags,
          sensitiveElements: securityAnalysis.sensitiveElements,
          recommendations: securityAnalysis.recommendations,
          metadata: {
            contentLength: content.length,
            processingTime: Date.now(),
            userId: context?.userId,
            orgId: context?.orgId,
          }
        };
      } catch (error) {
        // Fallback to basic classification
        return {
          securityLevel: 'internal',
          containsPii: false,
          hasRedaction: false,
          riskScore: 0.2,
          categories: ['general'],
          sensitiveElements: [],
          recommendations: ['Review content manually'],
          metadata: {
            contentLength: content.length,
            processingTime: Date.now(),
            error: error.message,
          }
        };
      }
    },
    
    createAiSafeContent: async (content: string, classification: any) => {
      try {
        // Use the enhanced workflow service's content sanitization
        const sanitized = enhancedService.sanitizeContent(content);
        return {
          aiSafeContent: sanitized,
          redactionDetails: {
            itemsRedacted: classification.sensitiveElements?.length || 0,
            redactionType: 'automatic',
            securityLevel: classification.securityLevel,
          }
        };
      } catch (error) {
        return {
          aiSafeContent: content, // Fallback to original
          redactionDetails: {
            itemsRedacted: 0,
            redactionType: 'none',
            error: error.message,
          }
        };
      }
    }
  };
};

// Process security classification
queues.security.process('classify-security', concurrencyLimits.security, async (job) => {
  const startTime = Date.now();
  const { content, userId, orgId, context } = job.data as SecurityJobData;
  
  try {
    logger.info(`🔒 Processing security classification for user ${userId}`, {
      contentLength: content.length,
      hasContext: !!context,
      orgId: orgId?.substring(0, 8),
    });

    job.progress(10);

    // Get RAG service
    const service = await getSecurityService();
    job.progress(20);

    // Perform security classification
    const classification = await service.classifyContent(content);
    job.progress(60);

    // Generate AI-safe version if needed
    let aiSafeContent = null;
    let redactionDetails = null;

    if (classification.securityLevel !== 'public') {
      try {
        aiSafeContent = await service.createAiSafeContent(content, classification);
        
        // Calculate redaction details
        redactionDetails = {
          originalLength: content.length,
          safeLength: aiSafeContent.length,
          redactionPercentage: Math.round((1 - aiSafeContent.length / content.length) * 100),
          securityLevel: classification.securityLevel,
          piiDetected: classification.containsPii,
        };
        
        job.progress(90);
      } catch (redactionError) {
        logger.warn('Failed to create AI-safe content, using original', {
          error: redactionError.message,
          userId: userId.substring(0, 8),
        });
        aiSafeContent = content; // Fallback to original content
      }
    } else {
      aiSafeContent = content; // Public content doesn't need redaction
      job.progress(90);
    }

    // Enhanced classification with additional metadata
    const enhancedClassification = {
      ...classification,
      processingMetadata: {
        processingTime: Date.now() - startTime,
        contentLength: content.length,
        hasRedaction: !!aiSafeContent && aiSafeContent !== content,
        orgId: orgId?.substring(0, 8),
        classificationDate: new Date().toISOString(),
      },
    };

    logger.info(`✅ Security classification completed for user ${userId}`, {
      securityLevel: classification.securityLevel,
      containsPii: classification.containsPii,
      hasSecurityTags: !!(classification.securityTags?.length),
      redactionNeeded: !!aiSafeContent && aiSafeContent !== content,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      classification: enhancedClassification,
      aiSafeContent,
      redactionDetails,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Security classification failed for user ${userId}:`, {
      error: error.message,
      stack: error.stack,
      processingTime,
      contentLength: content.length,
    });
    
    // Return conservative fallback classification on error
    const fallbackClassification = {
      securityLevel: 'internal' as const,
      containsPii: true, // Assume PII to be safe
      securityTags: ['error-fallback', 'requires-review'],
      reason: `Classification failed: ${error.message}`,
      confidence: 0.3,
      processingMetadata: {
        processingTime,
        contentLength: content.length,
        hasRedaction: false,
        orgId: orgId?.substring(0, 8),
        classificationDate: new Date().toISOString(),
        fallbackUsed: true,
        errorMessage: error.message,
      },
    };

    return {
      success: false,
      classification: fallbackClassification,
      aiSafeContent: '[CONTENT REDACTED DUE TO CLASSIFICATION ERROR]',
      redactionDetails: {
        originalLength: content.length,
        safeLength: 0,
        redactionPercentage: 100,
        securityLevel: 'internal',
        piiDetected: true,
        errorRedaction: true,
      },
      error: error.message,
      processingTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };
  }
});

// Batch security classification for efficiency
queues.security.process('batch-classify-security', 3, async (job) => {
  const startTime = Date.now();
  const { contents, userId, orgId } = job.data;
  
  try {
    logger.info(`🔒 Processing batch security classification for user ${userId}`, {
      contentsCount: contents.length,
      totalChars: contents.reduce((sum: number, content: any) => sum + (content.text || content).length, 0),
    });

    job.progress(10);

    // Get RAG service
    const service = await getSecurityService();
    job.progress(20);

    const results = [];
    
    for (let i = 0; i < contents.length; i++) {
      const contentItem = contents[i];
      const text = contentItem.text || contentItem;
      
      try {
        // Classify individual content
        const classification = await service.classifyContent(text);
        
        // Generate AI-safe version if needed
        let aiSafeContent = text;
        if (classification.securityLevel !== 'public') {
          try {
            aiSafeContent = await service.createAiSafeContent(text, classification);
          } catch (redactionError) {
            logger.warn(`Redaction failed for item ${i}:`, redactionError.message);
          }
        }

        results.push({
          id: contentItem.id || i,
          originalText: text,
          classification,
          aiSafeContent,
          success: true,
        });

      } catch (error) {
        logger.warn(`Security classification failed for item ${i}:`, error.message);
        
        results.push({
          id: contentItem.id || i,
          originalText: text,
          classification: {
            securityLevel: 'internal',
            containsPii: true,
            securityTags: ['batch-error'],
            reason: `Batch classification error: ${error.message}`,
          },
          aiSafeContent: '[REDACTED]',
          success: false,
          error: error.message,
        });
      }

      // Update progress
      job.progress(20 + (70 * (i + 1) / contents.length));
    }

    job.progress(95);

    const successfulClassifications = results.filter(r => r.success).length;
    
    logger.info(`✅ Batch security classification completed for user ${userId}`, {
      totalItems: contents.length,
      successful: successfulClassifications,
      failed: contents.length - successfulClassifications,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      results,
      totalProcessed: contents.length,
      successfulClassifications,
      failedClassifications: contents.length - successfulClassifications,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Batch security classification failed for user ${userId}:`, {
      error: error.message,
      processingTime,
      contentsCount: contents.length,
    });

    throw error;
  }
});

// Enhanced security analysis with PII detection
queues.security.process('analyze-security-enhanced', concurrencyLimits.security, async (job) => {
  const startTime = Date.now();
  const { content, userId, orgId, analysisOptions = {} } = job.data;
  
  try {
    logger.info(`🔍 Processing enhanced security analysis for user ${userId}`, {
      contentLength: content.length,
      analysisOptions,
    });

    job.progress(10);

    // Get RAG service
    const service = await getSecurityService();
    job.progress(15);

    // Perform basic classification
    const classification = await service.classifyContent(content);
    job.progress(40);

    // Enhanced PII detection patterns
    const piiPatterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /(\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
      creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
      ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
      url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
    };

    const detectedPii = {};
    const sensitiveElements = [];

    // Scan for PII
    for (const [type, pattern] of Object.entries(piiPatterns)) {
      const matches = content.match(pattern) || [];
      if (matches.length > 0) {
        detectedPii[type] = matches.length;
        sensitiveElements.push(...matches.map(match => ({ type, value: match })));
      }
    }

    job.progress(70);

    // Risk assessment
    const riskScore = calculateRiskScore(classification, detectedPii);
    const recommendations = generateSecurityRecommendations(classification, detectedPii, riskScore);

    job.progress(90);

    const enhancedAnalysis = {
      ...classification,
      piiDetection: {
        detected: detectedPii,
        count: Object.values(detectedPii).reduce((sum: number, count: number) => sum + count, 0),
        types: Object.keys(detectedPii),
        elements: sensitiveElements,
      },
      riskAssessment: {
        score: riskScore,
        level: getRiskLevel(riskScore),
        recommendations,
      },
      analysisMetadata: {
        processingTime: Date.now() - startTime,
        contentLength: content.length,
        patternsScanned: Object.keys(piiPatterns).length,
        analysisDate: new Date().toISOString(),
      },
    };

    logger.info(`✅ Enhanced security analysis completed for user ${userId}`, {
      securityLevel: classification.securityLevel,
      piiCount: enhancedAnalysis.piiDetection.count,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      analysis: enhancedAnalysis,
      processingTime: Date.now() - startTime,
      userId,
      orgId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Enhanced security analysis failed for user ${userId}:`, {
      error: error.message,
      processingTime,
    });

    throw error;
  }
});

// Helper functions
function calculateRiskScore(classification: any, detectedPii: any): number {
  let score = 0;

  // Base score from security level
  switch (classification.securityLevel) {
    case 'public': score += 10; break;
    case 'internal': score += 30; break;
    case 'confidential': score += 60; break;
    case 'restricted': score += 90; break;
  }

  // Add points for PII detection
  const piiCount = Object.values(detectedPii).reduce((sum: number, count: number) => sum + count, 0);
  score += Math.min(piiCount * 5, 50); // Max 50 points for PII

  // Add points for security tags
  if (classification.securityTags?.length > 0) {
    score += classification.securityTags.length * 2;
  }

  return Math.min(score, 100); // Cap at 100
}

function getRiskLevel(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 20) return 'low';
  return 'minimal';
}

function generateSecurityRecommendations(classification: any, detectedPii: any, riskScore: number): string[] {
  const recommendations = [];

  if (classification.containsPii) {
    recommendations.push('Implement PII redaction before external sharing');
  }

  if (classification.securityLevel === 'restricted' || classification.securityLevel === 'confidential') {
    recommendations.push('Restrict access to authorized personnel only');
    recommendations.push('Consider encryption for data at rest');
  }

  if (Object.keys(detectedPii).length > 0) {
    recommendations.push('Review and mask detected personally identifiable information');
  }

  if (riskScore > 70) {
    recommendations.push('High risk content - consider manual review');
    recommendations.push('Implement additional access controls');
  }

  if (detectedPii.email || detectedPii.phone) {
    recommendations.push('Consider anonymizing contact information');
  }

  if (detectedPii.creditCard || detectedPii.ssn) {
    recommendations.push('CRITICAL: Remove financial/identity information immediately');
  }

  return recommendations;
}

// Security worker monitoring events
queues.security.on('completed', (job) => {
  const duration = Date.now() - job.timestamp;
  const result = job.returnvalue;
  
  logger.info('✅ Security classification job completed', {
    jobId: job.id,
    jobName: job.name,
    duration: `${duration}ms`,
    securityLevel: result?.classification?.securityLevel,
    containsPii: result?.classification?.containsPii,
    hasRedaction: result?.redactionDetails?.redactionPercentage > 0,
  });
});

queues.security.on('failed', (job, error) => {
  logger.error('❌ Security classification job failed', {
    jobId: job.id,
    jobName: job.name,
    error: error.message,
    attempts: job.attemptsMade,
    userId: job.data?.userId?.substring(0, 8),
    contentLength: job.data?.content?.length,
  });
});

queues.security.on('stalled', (jobId) => {
  logger.warn('⚠️ Security classification job stalled', { jobId });
});

logger.info('🔒 Security Classification Worker initialized', {
  concurrency: concurrencyLimits.security,
  queueName: 'security-classification',
  supportedOperations: [
    'classify-security',
    'batch-classify-security',
    'analyze-security-enhanced'
  ],
});

export { queues as securityQueues };
