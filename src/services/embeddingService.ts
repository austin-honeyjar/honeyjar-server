import OpenAI from 'openai';
import logger from '../utils/logger';

export interface EmbeddingProvider {
  name: string;
  generateEmbedding(text: string): Promise<number[]>;
  dimensions: number;
  maxTokens: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions = 1536;
  maxTokens = 8191;
  
  private openai: OpenAI;

  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.slice(0, this.maxTokens),
      });
      
      return response.data[0].embedding;
    } catch (error) {
      logger.error('OpenAI embedding error:', error);
      throw new Error('Failed to generate OpenAI embedding');
    }
  }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions = 384; // Example: all-MiniLM-L6-v2
  maxTokens = 512;

  async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Implement local model (e.g., sentence-transformers, Ollama)
    // This could call a local API endpoint running your own models
    throw new Error('Local embedding provider not yet implemented');
  }
}

export class EmbeddingService {
  private provider: EmbeddingProvider;
  
  constructor(providerName: string = 'openai') {
    switch (providerName.toLowerCase()) {
      case 'openai':
        this.provider = new OpenAIEmbeddingProvider();
        break;
      case 'local':
        this.provider = new LocalEmbeddingProvider();
        break;
      default:
        throw new Error(`Unknown embedding provider: ${providerName}`);
    }
    
    logger.info(`Initialized embedding service with provider: ${this.provider.name}`);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // Truncate text to provider's max tokens
    const truncatedText = text.slice(0, this.provider.maxTokens);
    
    try {
      return await this.provider.generateEmbedding(truncatedText);
    } catch (error) {
      logger.error(`Embedding generation failed with provider ${this.provider.name}:`, error);
      throw error;
    }
  }

  getDimensions(): number {
    return this.provider.dimensions;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  // Helper to convert embedding to pgvector format
  embeddingToPgVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  // Helper to parse pgvector format back to array
  pgVectorToEmbedding(pgVector: string): number[] {
    return JSON.parse(pgVector.replace(/^\[/, '[').replace(/\]$/, ']'));
  }

  // Check if pgvector is available in the database
  async checkPgVectorAvailability(db: any): Promise<boolean> {
    try {
      const result = await db.execute(`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) as available;
      `);
      return result[0]?.available || false;
    } catch (error) {
      logger.warn('Could not check pgvector availability:', error);
      return false;
    }
  }

  // Calculate similarity score from pgvector distance
  distanceToSimilarity(distance: number): number {
    // Convert cosine distance to similarity score (0-1)
    return Math.max(0, 1 - distance);
  }

  // Convert similarity score to pgvector distance
  similarityToDistance(similarity: number): number {
    // Convert similarity score to cosine distance
    return Math.max(0, 1 - similarity);
  }
} 