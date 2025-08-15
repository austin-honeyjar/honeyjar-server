// Quick test script for the queue system
import { redis, queues, initializeQueues, shutdownQueues } from './src/services/comprehensiveQueues.js';

async function testQueueSystem() {
  console.log('🧪 Starting queue system test...');
  
  try {
    // Test 1: Initialize the queue system
    console.log('\n📋 Test 1: Initializing queue system...');
    await initializeQueues();
    console.log('✅ Queue system initialized successfully');
    
    // Test 2: Test Redis connection
    console.log('\n📋 Test 2: Testing Redis connection...');
    const pong = await redis.ping();
    console.log(`✅ Redis responded: ${pong}`);
    
    // Test 3: Add a test job to the intent queue
    console.log('\n📋 Test 3: Adding test job to intent queue...');
    const job = await queues.intent.add('classify-intent', {
      userMessage: 'Hello, test message',
      userId: 'test-user',
      threadId: 'test-thread',
    });
    console.log(`✅ Job added with ID: ${job.id}`);
    
    // Test 4: Check queue stats
    console.log('\n📋 Test 4: Checking queue statistics...');
    const stats = await queues.intent.getJobCounts();
    console.log('✅ Queue stats:', stats);
    
    // Test 5: Get the job status
    console.log('\n📋 Test 5: Getting job status...');
    const retrievedJob = await queues.intent.getJob(job.id);
    if (retrievedJob) {
      const state = await retrievedJob.getState();
      console.log(`✅ Job ${job.id} state: ${state}`);
    }
    
    console.log('\n🎉 All queue system tests passed!');
    
  } catch (error) {
    console.error('❌ Queue system test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    try {
      await shutdownQueues();
      console.log('✅ Queue system shut down cleanly');
    } catch (error) {
      console.log('⚠️ Cleanup completed');
    }
    process.exit(0);
  }
}

// Run the test
testQueueSystem().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
