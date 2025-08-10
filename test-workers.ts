// Test individual workers processing jobs
import { initializeQueues, shutdownQueues, queues } from './src/services/comprehensiveQueues.js';

// Import workers to register them
import './src/workers/intentWorker.js';
import './src/workers/openaiWorker.js';
import './src/workers/securityWorker.js';
import './src/workers/ragWorker.js';
import './src/workers/rocketreachWorker.js';

async function testWorkers() {
  console.log('🧪 Testing individual workers...');
  
  try {
    // Initialize queues
    await initializeQueues();
    
    console.log('\n📋 Test 1: Testing Intent Worker...');
    const intentJob = await queues.intent.add('classify-intent', {
      userMessage: 'Hello, test my intent classification',
      userId: 'test-user-123',
      threadId: 'test-thread-456',
      conversationHistory: [],
      currentWorkflow: null,
      userProfile: { name: 'Test User' },
      availableWorkflows: []
    });
    console.log(`✅ Intent job queued: ${intentJob.id}`);
    
    console.log('\n📋 Test 2: Testing OpenAI Worker...');
    const openaiJob = await queues.openai.add('chat-completion', {
      message: 'Hello, test my OpenAI integration',
      model: 'gpt-4',
      max_tokens: 100,
      userId: 'test-user-123',
      threadId: 'test-thread-456'
    });
    console.log(`✅ OpenAI job queued: ${openaiJob.id}`);
    
    console.log('\n📋 Test 3: Testing Security Worker...');
    const securityJob = await queues.security.add('classify-content', {
      content: 'This is test content for security classification',
      userId: 'test-user-123',
      orgId: 'test-org-789'
    });
    console.log(`✅ Security job queued: ${securityJob.id}`);
    
    console.log('\n📋 Test 4: Testing RAG Worker...');
    const ragJob = await queues.rag.add('document-search', {
      userId: 'test-user-123',
      orgId: 'test-org-789',
      searchQuery: 'test search query',
      options: { limit: 5 }
    });
    console.log(`✅ RAG job queued: ${ragJob.id}`);
    
    console.log('\n📋 Test 5: Testing RocketReach Worker...');
    const rocketreachJob = await queues.rocketreach.add('enrich-contact', {
      author: { name: 'John Doe', organization: 'Test Corp' },
      index: 0,
      selectedListType: 'test',
      originalTopic: 'test topic',
      userId: 'test-user-123'
    });
    console.log(`✅ RocketReach job queued: ${rocketreachJob.id}`);
    
    // Wait for jobs to process
    console.log('\n⏳ Waiting for jobs to process (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check job statuses
    console.log('\n📊 Final Job Statuses:');
    
    const jobs = [
      { name: 'Intent', job: intentJob },
      { name: 'OpenAI', job: openaiJob },
      { name: 'Security', job: securityJob },
      { name: 'RAG', job: ragJob },
      { name: 'RocketReach', job: rocketreachJob }
    ];
    
    for (const { name, job } of jobs) {
      const refreshedJob = await job.queue.getJob(job.id);
      if (refreshedJob) {
        const state = await refreshedJob.getState();
        const progress = refreshedJob.progress();
        console.log(`  ${name}: ${state} (${progress}% complete)`);
        
        if (state === 'completed' && refreshedJob.returnvalue) {
          console.log(`    Result preview: ${JSON.stringify(refreshedJob.returnvalue).substring(0, 100)}...`);
        }
        if (state === 'failed' && refreshedJob.failedReason) {
          console.log(`    Error: ${refreshedJob.failedReason}`);
        }
      }
    }
    
    console.log('\n🎉 Worker testing completed!');
    
  } catch (error) {
    console.error('❌ Worker test failed:', error);
    process.exit(1);
  } finally {
    console.log('\n🧹 Cleaning up...');
    try {
      await shutdownQueues();
      console.log('✅ All workers shut down cleanly');
    } catch (error) {
      console.log('⚠️ Cleanup completed');
    }
    process.exit(0);
  }
}

testWorkers().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
