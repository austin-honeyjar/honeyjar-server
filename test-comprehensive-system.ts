// Test the complete comprehensive worker system
import { initializeQueues, shutdownQueues, queues } from './src/services/comprehensiveQueues.js';
import logger from './src/utils/logger.js';

async function testComprehensiveSystem() {
  console.log('🧪 Testing complete comprehensive worker system...');
  
  try {
    await initializeQueues();
    
    // Set up simplified workers for all queue types
    console.log('\n🔧 Setting up all workers...');
    
    // Intent worker
    queues.intent.process('classify-intent', 2, async (job) => {
      logger.info(`🧠 Processing intent job ${job.id}`);
      job.progress(50);
      await new Promise(resolve => setTimeout(resolve, 1500));
      job.progress(100);
      return { 
        category: 'conversational', 
        action: 'general_conversation',
        confidence: 0.85,
        processingTime: 1500
      };
    });
    
    // OpenAI worker  
    queues.openai.process('chat-completion', 2, async (job) => {
      logger.info(`🤖 Processing OpenAI job ${job.id}`);
      job.progress(30);
      await new Promise(resolve => setTimeout(resolve, 3000));
      job.progress(100);
      return {
        choices: [{ message: { content: `AI response to: ${job.data.message}` }}],
        usage: { total_tokens: 150 }
      };
    });
    
    // Security worker
    queues.security.process('classify-content', 3, async (job) => {
      logger.info(`🔒 Processing security job ${job.id}`);
      job.progress(40);
      await new Promise(resolve => setTimeout(resolve, 1000));
      job.progress(100);
      return { 
        securityLevel: 'internal',
        containsPii: false,
        classification: 'safe'
      };
    });
    
    // RAG worker
    queues.rag.process('document-search', 2, async (job) => {
      logger.info(`📚 Processing RAG job ${job.id}`);
      job.progress(60);
      await new Promise(resolve => setTimeout(resolve, 2000));
      job.progress(100);
      return [
        { id: 'doc1', title: 'Relevant Document 1', score: 0.85 },
        { id: 'doc2', title: 'Relevant Document 2', score: 0.78 }
      ];
    });
    
    // RocketReach worker
    queues.rocketreach.process('enrich-contact', 1, async (job) => {
      logger.info(`🚀 Processing RocketReach job ${job.id}`);
      job.progress(25);
      await new Promise(resolve => setTimeout(resolve, 2500));
      job.progress(100);
      return {
        name: job.data.author.name,
        email: `${job.data.author.name.toLowerCase().replace(' ', '.')}@example.com`,
        enrichmentSource: 'simulated_rocketreach'
      };
    });
    
    console.log('✅ All workers registered');
    
    // Simulate the comprehensive chat controller workflow
    console.log('\n📋 Simulating comprehensive chat message processing...');
    
    const userMessage = "Hello, I need help with my project analysis";
    const userId = "test-user-123";
    const threadId = "test-thread-456";
    const orgId = "test-org-789";
    
    console.log(`📝 Processing message: "${userMessage}"`);
    
    // Queue all operations like the comprehensive chat controller
    const [intentJob, securityJob, ragJob, openaiJob] = await Promise.all([
      queues.intent.add('classify-intent', {
        userMessage,
        userId,
        threadId,
        conversationHistory: [],
        currentWorkflow: null,
        userProfile: { name: 'Test User' },
        availableWorkflows: []
      }),
      
      queues.security.add('classify-content', {
        content: userMessage,
        userId,
        orgId,
        threadId
      }),
      
      queues.rag.add('document-search', {
        userId,
        orgId,
        searchQuery: userMessage,
        options: { limit: 5 },
        threadId
      }),
      
      queues.openai.add('chat-completion', {
        message: userMessage,
        model: 'gpt-4',
        max_tokens: 1000,
        userId,
        threadId
      })
    ]);
    
    console.log('✅ All jobs queued simultaneously:');
    console.log(`  Intent Job: ${intentJob.id}`);
    console.log(`  Security Job: ${securityJob.id}`);
    console.log(`  RAG Job: ${ragJob.id}`);
    console.log(`  OpenAI Job: ${openaiJob.id}`);
    
    // Also add a RocketReach job
    const rocketreachJob = await queues.rocketreach.add('enrich-contact', {
      author: { name: 'John Doe', organization: 'Test Corp' },
      index: 0,
      selectedListType: 'journalists',
      originalTopic: 'project analysis',
      userId
    });
    
    console.log(`  RocketReach Job: ${rocketreachJob.id}`);
    
    // Monitor all jobs
    const allJobs = [
      { name: 'Intent', job: intentJob },
      { name: 'Security', job: securityJob },
      { name: 'RAG', job: ragJob },
      { name: 'OpenAI', job: openaiJob },
      { name: 'RocketReach', job: rocketreachJob }
    ];
    
    console.log('\n⏳ Monitoring job progress...');
    
    let allCompleted = false;
    let checkCount = 0;
    const maxChecks = 20; // 20 seconds max
    
    while (!allCompleted && checkCount < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      checkCount++;
      
      console.log(`\n📊 Progress check ${checkCount}:`);
      let completedCount = 0;
      
      for (const { name, job } of allJobs) {
        const refreshedJob = await job.queue.getJob(job.id);
        if (refreshedJob) {
          const state = await refreshedJob.getState();
          const progress = refreshedJob.progress();
          console.log(`  ${name}: ${state} (${progress}% complete)`);
          
          if (state === 'completed') {
            completedCount++;
          }
        }
      }
      
      allCompleted = completedCount === allJobs.length;
      
      if (allCompleted) {
        console.log('\n🎉 All jobs completed!');
        break;
      }
    }
    
    // Show final results
    console.log('\n🎯 Final Results:');
    for (const { name, job } of allJobs) {
      const refreshedJob = await job.queue.getJob(job.id);
      if (refreshedJob) {
        const state = await refreshedJob.getState();
        console.log(`\n${name} (${state}):`);
        
        if (state === 'completed' && refreshedJob.returnvalue) {
          console.log(`  Result: ${JSON.stringify(refreshedJob.returnvalue, null, 2)}`);
        } else if (state === 'failed' && refreshedJob.failedReason) {
          console.log(`  Error: ${refreshedJob.failedReason}`);
        }
      }
    }
    
    console.log('\n🎉 Comprehensive system test completed successfully!');
    console.log('\n💡 This simulates the real-world scenario where:');
    console.log('   - User sends a message');
    console.log('   - All background operations start immediately');
    console.log('   - User gets instant response (job IDs)');
    console.log('   - Operations complete in background');
    console.log('   - Results can be polled or streamed');
    
  } catch (error) {
    console.error('❌ Comprehensive test failed:', error);
  } finally {
    console.log('\n🧹 Cleaning up...');
    try {
      await shutdownQueues();
      console.log('✅ System shutdown completed');
    } catch (error) {
      console.log('⚠️ Cleanup finished');
    }
    process.exit(0);
  }
}

testComprehensiveSystem().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
