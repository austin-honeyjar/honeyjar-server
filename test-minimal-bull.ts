// Minimal Bull test to isolate the issue
import Bull from 'bull';

async function testMinimalBull() {
  console.log('🧪 Testing minimal Bull setup...');
  
  try {
    // Create a simple queue with minimal config
    const testQueue = new Bull('minimal-test', {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 1,
      }
    });

    console.log('✅ Queue created');

    // Add event listeners
    testQueue.on('error', (error) => {
      console.log('❌ Queue error:', error);
    });

    testQueue.on('waiting', (jobId) => {
      console.log(`⏳ Job ${jobId} is waiting`);
    });

    testQueue.on('active', (job) => {
      console.log(`🔄 Job ${job.id} started processing`);
    });

    testQueue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed:`, result);
    });

    testQueue.on('failed', (job, err) => {
      console.log(`❌ Job ${job.id} failed:`, err);
    });

    // Add processor
    console.log('\n🔧 Adding processor...');
    testQueue.process('test-job', 1, async (job) => {
      console.log(`🚀 PROCESSOR CALLED for job ${job.id}!`);
      console.log('Data:', job.data);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return { success: true, message: 'Minimal test worked!' };
    });

    console.log('✅ Processor added');

    // Add a job
    console.log('\n📋 Adding job...');
    const job = await testQueue.add('test-job', {
      message: 'Hello minimal Bull!',
      timestamp: Date.now()
    });

    console.log(`✅ Job added: ${job.id}`);

    // Wait for completion
    console.log('\n⏳ Waiting for job completion...');
    
    const result = await job.finished();
    console.log('🎉 Job completed with result:', result);

    // Clean up
    await testQueue.close();
    console.log('✅ Queue closed');

  } catch (error) {
    console.error('❌ Minimal test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

testMinimalBull().catch(console.error);
