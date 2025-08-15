// Test script that properly waits for Bull queue processing
import { initializeQueues, shutdownQueues, queues } from './src/services/comprehensiveQueues.js';
import logger from './src/utils/logger.js';

async function testQueueProcessing() {
  console.log('🧪 Testing Bull queue processing...');
  
  let jobCompleted = false;
  let jobResult: any = null;
  
  try {
    await initializeQueues();
    
    const intentQueue = queues.intent;
    
    // Set up processor BEFORE adding jobs
    console.log('\n🔧 Setting up processor...');
    intentQueue.process('classify-intent', 1, async (job) => {
      console.log(`🧠 PROCESSOR STARTED for job ${job.id}!`);
      console.log('Job data:', JSON.stringify(job.data, null, 2));
      
      job.progress(25);
      console.log('Progress: 25%');
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      job.progress(75);
      console.log('Progress: 75%');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      job.progress(100);
      console.log('Progress: 100%');
      
      const result = {
        success: true,
        message: 'Successfully processed intent',
        timestamp: Date.now(),
        jobId: job.id
      };
      
      console.log(`✅ PROCESSOR COMPLETED for job ${job.id}`);
      return result;
    });
    
    // Set up event listeners
    intentQueue.on('completed', (job, result) => {
      console.log(`🎉 Job ${job.id} completed with result:`, result);
      jobCompleted = true;
      jobResult = result;
    });
    
    intentQueue.on('failed', (job, err) => {
      console.log(`❌ Job ${job.id} failed:`, err);
      jobCompleted = true;
    });
    
    intentQueue.on('active', (job) => {
      console.log(`🔄 Job ${job.id} became active`);
    });
    
    intentQueue.on('progress', (job, progress) => {
      console.log(`📊 Job ${job.id} progress: ${progress}%`);
    });
    
    console.log('✅ Processor and listeners set up');
    
    // Add a job
    console.log('\n📋 Adding test job...');
    const job = await intentQueue.add('classify-intent', {
      userMessage: 'Test intent classification message',
      userId: 'test-user-123',
      threadId: 'test-thread-456',
      timestamp: Date.now()
    });
    
    console.log(`✅ Job added: ${job.id}`);
    
    // Wait for job to complete (up to 30 seconds)
    console.log('\n⏳ Waiting for job to complete...');
    let waitTime = 0;
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    
    while (!jobCompleted && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
      
      // Check job status
      const refreshedJob = await intentQueue.getJob(job.id);
      if (refreshedJob) {
        const state = await refreshedJob.getState();
        const progress = refreshedJob.progress();
        console.log(`  Time: ${waitTime/1000}s - Job ${job.id}: ${state} (${progress}% complete)`);
      }
    }
    
    if (jobCompleted) {
      console.log('\n🎉 SUCCESS! Job processing worked correctly!');
      console.log('Final result:', jobResult);
    } else {
      console.log('\n⚠️ Job did not complete within timeout period');
      
      // Check queue health
      const waiting = await intentQueue.getWaiting();
      const active = await intentQueue.getActive();
      const completed = await intentQueue.getCompleted();
      const failed = await intentQueue.getFailed();
      
      console.log('Queue status:');
      console.log(`  Waiting: ${waiting.length}`);
      console.log(`  Active: ${active.length}`);
      console.log(`  Completed: ${completed.length}`);
      console.log(`  Failed: ${failed.length}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
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

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  try {
    await shutdownQueues();
  } catch (e) {
    // ignore
  }
  process.exit(0);
});

testQueueProcessing().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
