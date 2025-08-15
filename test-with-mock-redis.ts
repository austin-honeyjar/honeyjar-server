// Test script using mock Redis (no external dependencies)
import Bull from 'bull';
import { createMockRedis } from './src/services/mockRedis.service.js';
import logger from './src/utils/logger.js';

async function testWithMockRedis() {
  console.log('🧪 Testing queue system with Mock Redis...');
  
  try {
    // Create mock Redis instance
    const mockRedis = createMockRedis();
    
    // Create a test queue with mock Redis
    const testQueue = new Bull('test-queue', {
      redis: {
        port: 6379,
        host: 'localhost',
        createClient: (type: string) => {
          console.log(`📋 Creating ${type} client with Mock Redis`);
          return mockRedis as any;
        }
      }
    });

    console.log('✅ Queue created with Mock Redis');

    // Test 1: Add a job
    console.log('\n📋 Test 1: Adding a test job...');
    const job = await testQueue.add('test-job', {
      message: 'Hello from mock Redis!',
      timestamp: Date.now(),
    });
    console.log(`✅ Job added with ID: ${job.id}`);

    // Test 2: Get job counts
    console.log('\n📋 Test 2: Getting queue statistics...');
    const stats = await testQueue.getJobCounts();
    console.log('✅ Queue stats:', stats);

    // Test 3: Process jobs
    console.log('\n📋 Test 3: Setting up job processor...');
    testQueue.process('test-job', async (job) => {
      console.log(`🔄 Processing job ${job.id}:`, job.data);
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true, processedAt: Date.now() };
    });

    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n🎉 Mock Redis queue system test completed successfully!');
    console.log('\n💡 This proves the queue system works - now let\'s set up real Redis...');

  } catch (error) {
    console.error('❌ Mock Redis test failed:', error);
  }
}

testWithMockRedis().catch(console.error);
