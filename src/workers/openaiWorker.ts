import { queues, concurrencyLimits, OpenAIJobData } from '../services/comprehensiveQueues';
import logger from '../utils/logger';

// Import OpenAI
let OpenAI: any;
let openai: any;

// Lazy load OpenAI to avoid issues
const getOpenAI = async () => {
  if (!OpenAI) {
    OpenAI = (await import('openai')).default;
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
};

// Process OpenAI chat completions
queues.openai.process('chat-completion', concurrencyLimits.openai, async (job) => {
  const startTime = Date.now();
  const { 
    message, 
    context, 
    model = 'gpt-4', 
    userId,
    maxTokens = 1000,
    temperature = 0.7 
  } = job.data as OpenAIJobData;
  
  try {
    logger.info(`🤖 Processing OpenAI chat completion for user ${userId}`, {
      model,
      messageLength: message.length,
      contextLength: context?.length || 0,
      maxTokens,
      temperature,
    });

    job.progress(10);

    // Get OpenAI instance
    const openaiClient = await getOpenAI();
    job.progress(20);

    // Prepare messages array
    const messages: any[] = [];
    
    if (context) {
      messages.push({ 
        role: 'system', 
        content: context 
      });
    }
    
    messages.push({ 
      role: 'user', 
      content: message 
    });

    job.progress(30);

    // Make the OpenAI API call
    const response = await openaiClient.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false, // Non-streaming for background processing
    });

    job.progress(80);

    const responseContent = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    logger.info(`✅ OpenAI chat completion completed for user ${userId}`, {
      model: response.model,
      tokensUsed: usage?.total_tokens,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      responseLength: responseContent.length,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      response: responseContent,
      usage,
      model: response.model,
      processingTime: Date.now() - startTime,
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        messageLength: message.length,
        contextLength: context?.length || 0,
        requestedModel: model,
        actualModel: response.model,
      },
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ OpenAI chat completion failed for user ${userId}:`, {
      error: error.message,
      code: error.code,
      type: error.type,
      processingTime,
      model,
    });

    // Check for specific OpenAI error types
    if (error.code === 'rate_limit_exceeded') {
      throw new Error('OpenAI rate limit exceeded. Please try again in a moment.');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI quota exceeded. Please check your billing.');
    } else if (error.code === 'invalid_api_key') {
      throw new Error('OpenAI API key is invalid.');
    }

    throw error;
  }
});

// Process OpenAI embeddings for RAG
queues.openai.process('generate-embedding', concurrencyLimits.openai, async (job) => {
  const startTime = Date.now();
  const { message: text, userId } = job.data as OpenAIJobData;
  
  try {
    logger.info(`🔗 Generating embedding for user ${userId}`, {
      textLength: text.length,
    });

    job.progress(10);

    // Get OpenAI instance
    const openaiClient = await getOpenAI();
    job.progress(30);

    // Generate embedding
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });

    job.progress(80);

    const embedding = response.data[0].embedding;
    const usage = response.usage;

    logger.info(`✅ Embedding generation completed for user ${userId}`, {
      embeddingDimensions: embedding.length,
      tokensUsed: usage?.total_tokens,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      embedding,
      usage,
      model: response.model,
      processingTime: Date.now() - startTime,
      userId,
      timestamp: new Date().toISOString(),
      metadata: {
        textLength: text.length,
        embeddingDimensions: embedding.length,
      },
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Embedding generation failed for user ${userId}:`, {
      error: error.message,
      code: error.code,
      type: error.type,
      processingTime,
      textLength: text.length,
    });

    throw error;
  }
});

// Process batch embeddings for efficiency
queues.openai.process('batch-generate-embeddings', 2, async (job) => {
  const startTime = Date.now();
  const { texts, userId } = job.data;
  
  try {
    logger.info(`🔗 Generating batch embeddings for user ${userId}`, {
      textsCount: texts.length,
      totalChars: texts.reduce((sum: number, text: string) => sum + text.length, 0),
    });

    job.progress(10);

    // Get OpenAI instance
    const openaiClient = await getOpenAI();
    job.progress(20);

    const embeddings = [];
    let totalTokens = 0;

    // Process in smaller batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await openaiClient.embeddings.create({
        model: 'text-embedding-ada-002',
        input: batch,
      });

      embeddings.push(...response.data.map(item => item.embedding));
      totalTokens += response.usage?.total_tokens || 0;

      // Update progress
      job.progress(20 + (60 * (i + batch.length) / texts.length));

      // Rate limiting delay between batches
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    job.progress(90);

    logger.info(`✅ Batch embedding generation completed for user ${userId}`, {
      embeddingsGenerated: embeddings.length,
      totalTokens,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      embeddings,
      totalTokens,
      count: embeddings.length,
      processingTime: Date.now() - startTime,
      userId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Batch embedding generation failed for user ${userId}:`, {
      error: error.message,
      code: error.code,
      processingTime,
      textsCount: texts.length,
    });

    throw error;
  }
});

// Process content moderation
queues.openai.process('moderate-content', concurrencyLimits.openai, async (job) => {
  const startTime = Date.now();
  const { message: text, userId } = job.data as OpenAIJobData;
  
  try {
    logger.info(`🛡️ Moderating content for user ${userId}`, {
      textLength: text.length,
    });

    job.progress(10);

    // Get OpenAI instance
    const openaiClient = await getOpenAI();
    job.progress(30);

    // Moderate content
    const response = await openaiClient.moderations.create({
      input: text,
    });

    job.progress(80);

    const moderation = response.results[0];

    logger.info(`✅ Content moderation completed for user ${userId}`, {
      flagged: moderation.flagged,
      categories: Object.keys(moderation.categories).filter(cat => moderation.categories[cat]),
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      flagged: moderation.flagged,
      categories: moderation.categories,
      categoryScores: moderation.category_scores,
      processingTime: Date.now() - startTime,
      userId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Content moderation failed for user ${userId}:`, {
      error: error.message,
      code: error.code,
      processingTime,
    });

    throw error;
  }
});

// Streaming chat completion for real-time responses
queues.openai.process('streaming-chat', 3, async (job) => {
  const startTime = Date.now();
  const { 
    message, 
    context, 
    model = 'gpt-4', 
    userId,
    maxTokens = 1000,
    temperature = 0.7,
    streamCallback 
  } = job.data as OpenAIJobData & { streamCallback?: string };
  
  try {
    logger.info(`🌊 Processing streaming OpenAI chat for user ${userId}`, {
      model,
      messageLength: message.length,
    });

    job.progress(10);

    // Get OpenAI instance
    const openaiClient = await getOpenAI();
    job.progress(20);

    // Prepare messages
    const messages: any[] = [];
    if (context) {
      messages.push({ role: 'system', content: context });
    }
    messages.push({ role: 'user', content: message });

    job.progress(30);

    // Create streaming completion
    const stream = await openaiClient.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    });

    job.progress(40);

    let fullResponse = '';
    let tokenCount = 0;

    // Process stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        tokenCount++;
        
        // Emit progress with content
        job.progress(40 + (50 * (tokenCount / maxTokens)));
        
        // If callback provided, could emit to WebSocket here
        // This would require additional infrastructure
      }
    }

    job.progress(95);

    logger.info(`✅ Streaming chat completion completed for user ${userId}`, {
      responseLength: fullResponse.length,
      estimatedTokens: tokenCount,
      processingTime: Date.now() - startTime,
    });

    job.progress(100);

    return {
      success: true,
      response: fullResponse,
      estimatedTokens: tokenCount,
      model,
      streaming: true,
      processingTime: Date.now() - startTime,
      userId,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`❌ Streaming chat completion failed for user ${userId}:`, {
      error: error.message,
      code: error.code,
      processingTime,
    });

    throw error;
  }
});

// OpenAI worker monitoring events
queues.openai.on('completed', (job) => {
  const duration = Date.now() - job.timestamp;
  const result = job.returnvalue;
  
  logger.info('✅ OpenAI job completed', {
    jobId: job.id,
    jobName: job.name,
    duration: `${duration}ms`,
    success: result?.success,
    tokensUsed: result?.usage?.total_tokens || result?.totalTokens || 'unknown',
    responseLength: result?.response?.length || 'unknown',
  });
});

queues.openai.on('failed', (job, error) => {
  logger.error('❌ OpenAI job failed', {
    jobId: job.id,
    jobName: job.name,
    error: error.message,
    attempts: job.attemptsMade,
    userId: job.data?.userId?.substring(0, 8),
    model: job.data?.model,
  });
});

queues.openai.on('stalled', (jobId) => {
  logger.warn('⚠️ OpenAI job stalled (likely due to API timeout)', { jobId });
});

queues.openai.on('progress', (job, progress) => {
  if (progress % 25 === 0) { // Log every 25% progress
    logger.debug('🔄 OpenAI job progress', {
      jobId: job.id,
      jobName: job.name,
      progress: `${progress}%`,
    });
  }
});

logger.info('🤖 OpenAI Worker initialized', {
  concurrency: concurrencyLimits.openai,
  queueName: 'openai-processing',
  supportedOperations: [
    'chat-completion',
    'generate-embedding', 
    'batch-generate-embeddings',
    'moderate-content',
    'streaming-chat'
  ],
});

export { queues as openaiQueues };
