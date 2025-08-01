-- migrations/001_add_pgvector_support.sql
-- Add pgvector support to existing embedding tables

BEGIN;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add new vector columns to existing tables
ALTER TABLE conversation_embeddings 
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

ALTER TABLE rag_documents 
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

ALTER TABLE user_uploads 
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

ALTER TABLE asset_history 
  ADD COLUMN IF NOT EXISTS content_embedding_vector vector(1536);

-- Add embedding provider tracking
ALTER TABLE conversation_embeddings
  ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

ALTER TABLE rag_documents
  ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

ALTER TABLE user_uploads
  ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

ALTER TABLE asset_history
  ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

COMMIT; 