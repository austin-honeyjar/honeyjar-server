// Debug script to understand why jobs aren't processing
import { initializeQueues, shutdownQueues, queues } from './src/services/comprehensiveQueues.js';
import logger from './src/utils/logger.js';

async function debugQueue() {
  console.log('🔍 Debugging queue behavior...');
  
  try {
    await initializeQueues();
    
    // Add extensive event listeners to see what's happening
    const intentQueue = queues.intent;
    
    console.log('\n📋 Setting up queue event listeners...');
    
    intentQueue.on('error', (error) => {
      console.log('❌ Queue error:', error);
    });
    
    intentQueue.on('waiting', (jobId) => {
      console.log(`⏳ Job ${jobId} is waiting`);
    });
    
    intentQueue.on('active', (job, jobPromise) => {
      console.log(`🔄 Job ${job.id} started processing`);
    });
    
    intentQueue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed:`, result);
    });
    
    intentQueue.on('failed', (job, err) => {
      console.log(`❌ Job ${job.id} failed:`, err);
    });
    
    intentQueue.on('stalled', (job) => {
      console.log(`🚫 Job ${job.id} stalled`);
    });
    
    intentQueue.on('progress', (job, progress) => {
      console.log(`📊 Job ${job.id} progress: ${progress}%`);
    });
    
    // Add a very simple processor
    console.log('\n🔧 Adding simple processor...');
    intentQueue.process('classify-intent', 1, async (job) => {
      console.log(`🧠 PROCESSOR CALLED for job ${job.id}!`);
      console.log('Job data:', job.data);
      
      job.progress(50);
      await new Promise(resolve => setTimeout(resolve, 1000));
      job.progress(100);
      
      console.log(`✅ PROCESSOR FINISHED for job ${job.id}`);
      return { success: true, message: 'Processed successfully' };
    });
    
    console.log('✅ Processor registered');
    
    // Add a job
    console.log('\n📋 Adding test job...');
    const job = await intentQueue.add('classify-intent', {
      userMessage: 'Test message',
      userId: 'test-user',
      timestamp: Date.now()
    });
    
    console.log(`✅ Job added: ${job.id}`);
    
    // Check Redis directly
    console.log('\n🔍 Checking Redis directly...');
    const redis = (await import('./src/services/comprehensiveQueues.js')).redis;
    
    const queueKeys = await redis.keys('bull:intent-classification:*');
    console.log('Redis keys for intent queue:', queueKeys);
    
    const waitingJobs = await redis.llen('bull:intent-classification:waiting');
    console.log('Waiting jobs count:', waitingJobs);
    
    // Wait and monitor
    console.log('\n⏳ Monitoring for 10 seconds...');
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const refreshedJob = await intentQueue.getJob(job.id);
      if (refreshedJob) {
        const state = await refreshedJob.getState();
        console.log(`Second ${i + 1}: Job ${job.id} state: ${state}`);
      }
    }
    
    console.log('\n🎯 Debug completed');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    try {
      await shutdownQueues();
    } catch (e) {
      console.log('Cleanup done');
    }
    process.exit(0);
  }
}

debugQueue().catch(console.error);
