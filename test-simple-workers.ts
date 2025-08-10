// Test with simplified mock workers that just simulate processing
import { initializeQueues, shutdownQueues, queues } from './src/services/comprehensiveQueues.js';
import logger from './src/utils/logger.js';

async function testSimpleWorkers() {
  console.log('🧪 Testing with simplified workers...');
  
  try {
    // Initialize queues
    await initializeQueues();
    
    // Set up simple workers that just simulate processing
    console.log('\n🔧 Setting up simplified workers...');
    
    // Intent worker - just simulates processing
    queues.intent.process('classify-intent', 2, async (job) => {
      logger.info(`🧠 Processing intent job ${job.id}`);
      job.progress(25);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      job.progress(75);
      
      const result = {
        category: 'conversational',
        action: 'general_conversation',
        confidence: 0.85,
        reasoning: 'Simulated intent classification',
        processingTime: 2000
      };
      
      job.progress(100);
      logger.info(`✅ Intent job ${job.id} completed`);
      return result;
    });
    
    // OpenAI worker - simulates API call
    queues.openai.process('chat-completion', 2, async (job) => {
      logger.info(`🤖 Processing OpenAI job ${job.id}`);
      job.progress(20);
      
      // Simulate API call time
      await new Promise(resolve => setTimeout(resolve, 3000));
      job.progress(80);
      
      const result = {
        id: `chatcmpl-${job.id}`,
        choices: [{
          message: {
            role: 'assistant',
            content: `Simulated AI response to: "${job.data.message.substring(0, 50)}..."`
          }
        }],
        usage: { total_tokens: 100 }
      };
      
      job.progress(100);
      logger.info(`✅ OpenAI job ${job.id} completed`);
      return result;
    });
    
    // Security worker - simulates classification
    queues.security.process('classify-content', 2, async (job) => {
      logger.info(`🔒 Processing security job ${job.id}`);
      job.progress(30);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      job.progress(90);
      
      const result = {
        securityLevel: 'internal',
        containsPii: false,
        classification: 'safe',
        processingTime: 1500
      };
      
      job.progress(100);
      logger.info(`✅ Security job ${job.id} completed`);
      return result;
    });
    
    console.log('✅ Simplified workers registered');
    
    // Add test jobs
    console.log('\n📋 Adding test jobs...');
    
    const intentJob = await queues.intent.add('classify-intent', {
      userMessage: 'Hello, test my intent classification',
      userId: 'test-user-123'
    });
    console.log(`✅ Intent job queued: ${intentJob.id}`);
    
    const openaiJob = await queues.openai.add('chat-completion', {
      message: 'Hello, test my OpenAI integration',
      model: 'gpt-4'
    });
    console.log(`✅ OpenAI job queued: ${openaiJob.id}`);
    
    const securityJob = await queues.security.add('classify-content', {
      content: 'This is test content for security classification',
      userId: 'test-user-123'
    });
    console.log(`✅ Security job queued: ${securityJob.id}`);
    
    // Monitor job progress
    console.log('\n⏳ Monitoring job progress...');
    
    const jobs = [
      { name: 'Intent', job: intentJob },
      { name: 'OpenAI', job: openaiJob },
      { name: 'Security', job: securityJob }
    ];
    
    // Check progress every 2 seconds for 15 seconds
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`\n📊 Progress check ${i + 1}:`);
      for (const { name, job } of jobs) {
        const refreshedJob = await job.queue.getJob(job.id);
        if (refreshedJob) {
          const state = await refreshedJob.getState();
          const progress = refreshedJob.progress();
          console.log(`  ${name}: ${state} (${progress}% complete)`);
        }
      }
    }
    
    // Final status
    console.log('\n🎯 Final Results:');
    for (const { name, job } of jobs) {
      const refreshedJob = await job.queue.getJob(job.id);
      if (refreshedJob) {
        const state = await refreshedJob.getState();
        console.log(`  ${name}: ${state}`);
        
        if (state === 'completed' && refreshedJob.returnvalue) {
          console.log(`    Result: ${JSON.stringify(refreshedJob.returnvalue).substring(0, 150)}...`);
        }
        if (state === 'failed' && refreshedJob.failedReason) {
          console.log(`    Error: ${refreshedJob.failedReason}`);
        }
      }
    }
    
    console.log('\n🎉 Simplified worker testing completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    console.log('\n🧹 Cleaning up...');
    try {
      await shutdownQueues();
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.log('⚠️ Cleanup finished');
    }
    process.exit(0);
  }
}

testSimpleWorkers().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
