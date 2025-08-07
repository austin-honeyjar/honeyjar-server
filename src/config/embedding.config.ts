export interface EmbeddingConfig {
  provider: 'openai' | 'local' | 'huggingface' | 'ollama';
  
  // OpenAI settings
  openai?: {
    apiKey?: string;
    model: 'text-embedding-ada-002' | 'text-embedding-3-small' | 'text-embedding-3-large';
    dimensions: number;
    maxTokens: number;
  };
  
  // Local model settings
  local?: {
    endpoint: string;
    model: string;
    dimensions: number;
    maxTokens: number;
  };
  
  // Hugging Face settings
  huggingface?: {
    apiKey?: string;
    model: string;
    dimensions: number;
    maxTokens: number;
  };
  
  // Ollama settings
  ollama?: {
    endpoint: string;
    model: string;
    dimensions: number;
    maxTokens: number;
  };
  
  // Database settings
  database: {
    usePgVector: boolean;
    indexType: 'ivfflat' | 'hnsw';
    indexLists?: number; // For ivfflat
    indexM?: number; // For hnsw
    indexEfConstruction?: number; // For hnsw
  };
  
  // Search settings
  search: {
    defaultSimilarityThreshold: number;
    defaultLimit: number;
    enableCache: boolean;
    cacheExpiryHours: number;
  };
}

export const defaultEmbeddingConfig: EmbeddingConfig = {
  provider: (process.env.EMBEDDING_PROVIDER as any) || 'openai',
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-ada-002',
    dimensions: 1536,
    maxTokens: 8191,
  },
  
  local: {
    endpoint: process.env.LOCAL_EMBEDDING_ENDPOINT || 'http://localhost:8080/embeddings',
    model: process.env.LOCAL_EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
    dimensions: parseInt(process.env.LOCAL_EMBEDDING_DIMENSIONS || '384'),
    maxTokens: parseInt(process.env.LOCAL_EMBEDDING_MAX_TOKENS || '512'),
  },
  
  huggingface: {
    apiKey: process.env.HUGGINGFACE_API_KEY,
    model: process.env.HUGGINGFACE_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
    dimensions: parseInt(process.env.HUGGINGFACE_DIMENSIONS || '384'),
    maxTokens: parseInt(process.env.HUGGINGFACE_MAX_TOKENS || '512'),
  },
  
  ollama: {
    endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'nomic-embed-text',
    dimensions: parseInt(process.env.OLLAMA_DIMENSIONS || '768'),
    maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '2048'),
  },
  
  database: {
    usePgVector: process.env.USE_PGVECTOR?.toLowerCase() === 'true' || true,
    indexType: (process.env.PGVECTOR_INDEX_TYPE as any) || 'ivfflat',
    indexLists: parseInt(process.env.PGVECTOR_INDEX_LISTS || '100'),
    indexM: parseInt(process.env.PGVECTOR_INDEX_M || '16'),
    indexEfConstruction: parseInt(process.env.PGVECTOR_INDEX_EF_CONSTRUCTION || '64'),
  },
  
  search: {
    defaultSimilarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7'),
    defaultLimit: parseInt(process.env.SEARCH_LIMIT || '10'),
    enableCache: process.env.ENABLE_EMBEDDING_CACHE?.toLowerCase() !== 'false',
    cacheExpiryHours: parseInt(process.env.CACHE_EXPIRY_HOURS || '24'),
  },
};

// Environment variables guide for .env file:
export const ENV_GUIDE = `
# Embedding Configuration
EMBEDDING_PROVIDER=openai          # openai, local, huggingface, ollama
USE_PGVECTOR=true                 # Enable pgvector for better performance

# OpenAI Settings (if using OpenAI)
OPENAI_API_KEY=your_openai_key
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002

# Local Embedding Server (if using local)
LOCAL_EMBEDDING_ENDPOINT=http://localhost:8080/embeddings
LOCAL_EMBEDDING_MODEL=all-MiniLM-L6-v2
LOCAL_EMBEDDING_DIMENSIONS=384
LOCAL_EMBEDDING_MAX_TOKENS=512

# Hugging Face (if using huggingface)
HUGGINGFACE_API_KEY=your_hf_key
HUGGINGFACE_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Ollama (if using ollama)
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=nomic-embed-text

# pgvector Settings
PGVECTOR_INDEX_TYPE=ivfflat       # ivfflat or hnsw
PGVECTOR_INDEX_LISTS=100          # For ivfflat index

# Search Settings
SIMILARITY_THRESHOLD=0.7
SEARCH_LIMIT=10
ENABLE_EMBEDDING_CACHE=true
CACHE_EXPIRY_HOURS=24
`;

export function getEmbeddingConfig(): EmbeddingConfig {
  return defaultEmbeddingConfig;
} 