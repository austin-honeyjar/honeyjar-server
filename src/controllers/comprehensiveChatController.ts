import { Request, Response } from 'express';
import { queues, findJobAcrossQueues } from '../services/comprehensiveQueues';
import logger from '../utils/logger';

export class ComprehensiveChatController {
  /**
   * Non-blocking chat endpoint that queues ALL heavy operations
   */
  static async chat(req: Request, res: Response) {
    const startTime = Date.now();
    
    try {
      const { 
        message, 
        context, 
        threadId,
        includeRAG = true, 
        includeDashboard = false,
        includeContactEnrichment = false,
        includeSecurityAnalysis = true,
        streamResponse = false 
      } = req.body;
      
      const userId = req.user?.id || 'anonymous';
      const orgId = req.user?.orgId || '';

      logger.info(`🚀 Processing comprehensive chat request for user ${userId}`, {
        messageLength: message.length,
        threadId: threadId?.substring(0, 8),
        includeRAG,
        includeDashboard,
        includeContactEnrichment,
        includeSecurityAnalysis,
        streamResponse,
      });

      // Validate required fields
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          error: 'Message is required and must be a string',
          timestamp: new Date().toISOString(),
        });
      }

      // Queue ALL operations in parallel with proper priorities
      const jobs: any[] = [];
      const jobPromises: Promise<any>[] = [];

      // 1. Intent Classification (Priority: High - affects all downstream processing)
      const intentPromise = queues.intent.add('classify-intent', {
        userMessage: message,
        conversationHistory: context?.history || [],
        currentWorkflow: context?.workflow,
        userId,
        threadId,
        orgId,
      }, { 
        priority: 2,
        delay: 0 // Process immediately
      });

      jobPromises.push(intentPromise);

      // 2. Security Classification (Priority: Medium - important for compliance)
      if (includeSecurityAnalysis) {
        const securityPromise = queues.security.add('classify-security', {
          content: message,
          userId,
          orgId,
          context,
        }, { 
          priority: 4,
          delay: 100 // Small delay to allow intent to start first
        });

        jobPromises.push(securityPromise);
      }

      // 3. RAG Search (Priority: High - needed for context)
      if (includeRAG) {
        const ragPromise = queues.rag.add('document-search', {
          query: message,
          userId,
          orgId,
          limit: 5,
          threshold: 0.7,
          securityLevel: 'internal',
        }, { 
          priority: 3,
          delay: 200 // Allow intent classification to inform search
        });

        jobPromises.push(ragPromise);
      }

      // 4. OpenAI Processing (Priority: Highest - user-facing response)
      const openaiJobType = streamResponse ? 'streaming-chat' : 'chat-completion';
      const openaiPromise = queues.openai.add(openaiJobType, {
        message,
        context: context?.systemPrompt || context?.context,
        model: context?.model || 'gpt-4',
        userId,
        jobType: openaiJobType,
        maxTokens: context?.maxTokens || 1000,
        temperature: context?.temperature || 0.7,
      }, { 
        priority: 1, // Highest priority
        delay: 300 // Allow some context to be gathered first
      });

      jobPromises.push(openaiPromise);

      // 5. Dashboard Data (Priority: Lower - supplementary information)
      if (includeDashboard && req.body.dashboardId) {
        const dashboardPromise = queues.metabase.add('dashboard-query', {
          dashboardId: req.body.dashboardId,
          parameters: req.body.dashboardParameters || {},
          userId,
        }, { 
          priority: 5,
          delay: 500 // Lower priority, process after core operations
        });

        jobPromises.push(dashboardPromise);
      }

      // 6. Contact Enrichment (Priority: Lowest - optional enhancement)
      if (includeContactEnrichment && req.body.contacts) {
        const contactPromise = queues.rocketreach.add('contact-enrichment', {
          contacts: req.body.contacts,
          workflowType: context?.workflow?.type,
          userId,
          orgId,
          jobType: 'contact-enrichment',
        }, { 
          priority: 6,
          delay: 1000 // Lowest priority
        });

        jobPromises.push(contactPromise);
      }

      // Wait for all jobs to be queued
      const queuedJobs = await Promise.all(jobPromises);

      // Build job tracking information
      queuedJobs.forEach((job, index) => {
        const jobTypes = [
          'intent-classification',
          ...(includeSecurityAnalysis ? ['security-classification'] : []),
          ...(includeRAG ? ['rag-search'] : []),
          'openai-chat',
          ...(includeDashboard ? ['dashboard-query'] : []),
          ...(includeContactEnrichment ? ['contact-enrichment'] : [])
        ];

        const estimatedTimes = [
          '2-4 seconds',
          ...(includeSecurityAnalysis ? ['1-3 seconds'] : []),
          ...(includeRAG ? ['3-8 seconds'] : []),
          '5-15 seconds',
          ...(includeDashboard ? ['2-5 seconds'] : []),
          ...(includeContactEnrichment ? ['3-10 seconds'] : [])
        ];

        const jobNames = [
          'Understanding Intent',
          ...(includeSecurityAnalysis ? ['Security Analysis'] : []),
          ...(includeRAG ? ['Document Search'] : []),
          'AI Response Generation',
          ...(includeDashboard ? ['Dashboard Data'] : []),
          ...(includeContactEnrichment ? ['Contact Enrichment'] : [])
        ];

        if (jobTypes[index] && jobNames[index]) {
          jobs.push({ 
            id: job.id, 
            type: jobTypes[index], 
            name: jobNames[index],
            estimatedTime: estimatedTimes[index] || '1-5 seconds',
            priority: job.opts.priority,
            queuedAt: new Date().toISOString(),
          });
        }
      });

      // Calculate estimated completion time
      const maxEstimatedTime = Math.max(
        includeSecurityAnalysis ? 3 : 0,
        includeRAG ? 8 : 0,
        15, // OpenAI
        includeDashboard ? 5 : 0,
        includeContactEnrichment ? 10 : 0
      );

      // Return immediate response with comprehensive job tracking
      const response = {
        status: 'processing',
        message: 'Your request is being processed in the background...',
        jobs,
        processingPipeline: {
          phase1: {
            name: 'Analysis & Understanding',
            operations: ['Intent Classification', ...(includeSecurityAnalysis ? ['Security Analysis'] : [])],
            estimatedTime: '2-4 seconds',
          },
          phase2: {
            name: 'Context & AI Processing',
            operations: ['Document Search', 'AI Response Generation'].filter(Boolean),
            estimatedTime: '5-15 seconds',
          },
          phase3: {
            name: 'Enhancement & Enrichment',
            operations: [
              ...(includeDashboard ? ['Dashboard Data'] : []),
              ...(includeContactEnrichment ? ['Contact Enrichment'] : [])
            ].filter(Boolean),
            estimatedTime: '2-10 seconds',
          },
        },
        metadata: {
          totalJobs: jobs.length,
          estimatedTotalTime: `${maxEstimatedTime} seconds`,
          queueingTime: `${Date.now() - startTime}ms`,
          streamingEnabled: streamResponse,
          threadId,
          userId: userId.substring(0, 8),
        },
        tracking: {
          checkStatusUrl: `/api/chat/comprehensive-status`,
          checkInterval: '2 seconds',
          timeoutAfter: '60 seconds',
        },
        timestamp: new Date().toISOString(),
      };

      res.json(response);

      logger.info(`✅ Comprehensive chat request queued for user ${userId}`, {
        totalJobs: jobs.length,
        jobTypes: jobs.map(j => j.type),
        queueingTime: Date.now() - startTime,
        threadId: threadId?.substring(0, 8),
      });

    } catch (error) {
      logger.error('❌ Failed to queue comprehensive chat request:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id?.substring(0, 8),
        messageLength: req.body?.message?.length,
      });

      res.status(500).json({ 
        error: 'Failed to process chat request',
        message: 'Please try again in a moment.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Check status of all queued jobs with intelligent aggregation
   */
  static async getComprehensiveStatus(req: Request, res: Response) {
    try {
      const { jobIds, threadId, includeResults = true } = req.body;
      
      if (!jobIds || !Array.isArray(jobIds)) {
        return res.status(400).json({
          error: 'jobIds array is required',
          timestamp: new Date().toISOString(),
        });
      }

      logger.debug(`🔍 Checking status for ${jobIds.length} jobs`, {
        threadId: threadId?.substring(0, 8),
        includeResults,
      });

      // Get status of all jobs in parallel
      const jobStatuses = await Promise.all(
        jobIds.map(async (jobId: string) => {
          try {
            // Find job across all queues
            const jobResult = await findJobAcrossQueues(jobId);
            
            if (!jobResult) {
              return { 
                jobId, 
                status: 'not_found',
                error: 'Job not found in any queue',
              };
            }

            const { job, queueName } = jobResult;
            const state = await job.getState();
            
            return {
              jobId,
              queueName,
              type: job.name,
              status: state,
              progress: job.progress(),
              result: includeResults ? job.returnvalue : undefined,
              error: job.failedReason,
              attempts: job.attemptsMade,
              maxAttempts: job.opts?.attempts,
              createdAt: job.timestamp,
              processedAt: job.processedOn,
              completedAt: job.finishedOn,
              estimatedDuration: job.finishedOn 
                ? job.finishedOn - job.timestamp 
                : Date.now() - job.timestamp,
            };
          } catch (error) {
            logger.warn(`Failed to get status for job ${jobId}:`, error.message);
            return { 
              jobId, 
              status: 'error', 
              error: error.message 
            };
          }
        })
      );

      // Calculate overall progress and status
      const completedJobs = jobStatuses.filter(job => job.status === 'completed');
      const failedJobs = jobStatuses.filter(job => job.status === 'failed');
      const activeJobs = jobStatuses.filter(job => job.status === 'active');
      const waitingJobs = jobStatuses.filter(job => job.status === 'waiting');

      const overallProgress = jobStatuses.length > 0 
        ? Math.round(jobStatuses.reduce((sum, job) => sum + (job.progress || 0), 0) / jobStatuses.length)
        : 0;

      const allComplete = jobStatuses.every(job => 
        job.status === 'completed' || job.status === 'failed'
      );

      // Intelligent result aggregation
      let aggregatedResult = null;
      if (allComplete && includeResults) {
        aggregatedResult = {
          intent: completedJobs.find(job => job.type === 'classify-intent')?.result,
          security: completedJobs.find(job => job.type === 'classify-security')?.result,
          chatResponse: completedJobs.find(job => 
            job.type === 'chat-completion' || job.type === 'streaming-chat'
          )?.result,
          ragResults: completedJobs.find(job => job.type === 'document-search')?.result,
          dashboardData: completedJobs.find(job => job.type === 'dashboard-query')?.result,
          contactData: completedJobs.find(job => job.type === 'contact-enrichment')?.result,
          userKnowledge: completedJobs.find(job => job.type === 'user-knowledge')?.result,
        };

        // Remove null/undefined results
        Object.keys(aggregatedResult).forEach(key => {
          if (!aggregatedResult[key]) {
            delete aggregatedResult[key];
          }
        });
      }

      // Calculate performance metrics
      const completedJobsWithTiming = completedJobs.filter(job => job.estimatedDuration);
      const averageProcessingTime = completedJobsWithTiming.length > 0
        ? Math.round(completedJobsWithTiming.reduce((sum, job) => sum + job.estimatedDuration, 0) / completedJobsWithTiming.length)
        : 0;

      const response = {
        jobs: jobStatuses,
        summary: {
          total: jobStatuses.length,
          completed: completedJobs.length,
          failed: failedJobs.length,
          active: activeJobs.length,
          waiting: waitingJobs.length,
          overallProgress,
          allComplete,
        },
        performance: {
          averageProcessingTime: `${averageProcessingTime}ms`,
          fastestJob: completedJobsWithTiming.length > 0 
            ? `${Math.min(...completedJobsWithTiming.map(j => j.estimatedDuration))}ms`
            : 'N/A',
          slowestJob: completedJobsWithTiming.length > 0 
            ? `${Math.max(...completedJobsWithTiming.map(j => j.estimatedDuration))}ms`
            : 'N/A',
        },
        result: aggregatedResult,
        threadId,
        timestamp: new Date().toISOString(),
      };

      res.json(response);

      if (allComplete) {
        logger.info(`✅ All jobs completed for thread ${threadId?.substring(0, 8)}`, {
          completed: completedJobs.length,
          failed: failedJobs.length,
          averageTime: averageProcessingTime,
        });
      }

    } catch (error) {
      logger.error('❌ Failed to get comprehensive status:', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({ 
        error: 'Failed to get status',
        message: 'Please try again',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Cancel pending jobs
   */
  static async cancelJobs(req: Request, res: Response) {
    try {
      const { jobIds, reason = 'User requested cancellation' } = req.body;
      const userId = req.user?.id;

      if (!jobIds || !Array.isArray(jobIds)) {
        return res.status(400).json({
          error: 'jobIds array is required',
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`🚫 Cancelling ${jobIds.length} jobs for user ${userId?.substring(0, 8)}`, {
        reason,
      });

      const cancelResults = await Promise.all(
        jobIds.map(async (jobId: string) => {
          try {
            const jobResult = await findJobAcrossQueues(jobId);

            if (!jobResult) {
              return { 
                jobId, 
                cancelled: false, 
                reason: 'Job not found' 
              };
            }

            const { job, queueName } = jobResult;

            // Verify user owns this job (security check)
            if (job.data.userId !== userId) {
              logger.warn('User attempted to cancel another user\'s job', {
                requestingUserId: userId?.substring(0, 8),
                jobUserId: job.data.userId?.substring(0, 8),
                jobId,
              });
              return { 
                jobId, 
                cancelled: false, 
                reason: 'Access denied' 
              };
            }

            const state = await job.getState();
            
            // Can't cancel completed or failed jobs
            if (state === 'completed' || state === 'failed') {
              return { 
                jobId, 
                cancelled: false, 
                reason: `Job already ${state}` 
              };
            }

            // Cancel the job
            await job.remove();

            logger.info(`Job cancelled successfully`, {
              jobId,
              queueName,
              previousState: state,
              userId: userId?.substring(0, 8),
            });

            return { 
              jobId, 
              cancelled: true, 
              queueName,
              previousState: state,
            };

          } catch (error) {
            logger.error(`Failed to cancel job ${jobId}:`, error);
            return { 
              jobId, 
              cancelled: false, 
              reason: error.message 
            };
          }
        })
      );

      const successfulCancellations = cancelResults.filter(r => r.cancelled).length;

      res.json({
        cancelResults,
        summary: {
          requested: jobIds.length,
          successful: successfulCancellations,
          failed: jobIds.length - successfulCancellations,
        },
        reason,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Job cancellation completed for user ${userId?.substring(0, 8)}`, {
        requested: jobIds.length,
        successful: successfulCancellations,
        failed: jobIds.length - successfulCancellations,
      });

    } catch (error) {
      logger.error('❌ Failed to cancel jobs:', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({ 
        error: 'Failed to cancel jobs',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get queue health and statistics
   */
  static async getQueueStats(req: Request, res: Response) {
    try {
      const stats = {};
      const healthChecks = {};

      // Get stats for each queue
      for (const [queueName, queue] of Object.entries(queues)) {
        try {
          const [counts, waiting, active, completed, failed] = await Promise.all([
            queue.getJobCounts(),
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed(),
          ]);

          stats[queueName] = {
            counts,
            sampleJobs: {
              waiting: waiting.slice(0, 3).map(job => ({
                id: job.id,
                name: job.name,
                createdAt: job.timestamp,
              })),
              active: active.slice(0, 3).map(job => ({
                id: job.id,
                name: job.name,
                progress: job.progress(),
                startedAt: job.processedOn,
              })),
              recentCompleted: completed.slice(0, 3).map(job => ({
                id: job.id,
                name: job.name,
                completedAt: job.finishedOn,
                duration: job.finishedOn - job.timestamp,
              })),
            },
          };

          healthChecks[queueName] = 'healthy';
        } catch (error) {
          healthChecks[queueName] = 'unhealthy';
          stats[queueName] = { error: error.message };
        }
      }

      // Calculate totals
      const totals = {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };

      Object.values(stats).forEach((queueStats: any) => {
        if (queueStats.counts) {
          Object.keys(totals).forEach(key => {
            totals[key] += queueStats.counts[key] || 0;
          });
        }
      });

      res.json({
        queues: stats,
        health: healthChecks,
        totals,
        healthySummary: {
          totalQueues: Object.keys(queues).length,
          healthyQueues: Object.values(healthChecks).filter(h => h === 'healthy').length,
          overallHealth: Object.values(healthChecks).every(h => h === 'healthy') ? 'healthy' : 'degraded',
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('❌ Failed to get queue stats:', error);
      res.status(500).json({ 
        error: 'Failed to get queue statistics',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export default ComprehensiveChatController;
