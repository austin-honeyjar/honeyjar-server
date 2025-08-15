-- migrations/003_create_vector_indexes.sql
-- Create optimized vector indexes for fast similarity search

BEGIN;

-- Create ivfflat indexes for approximate nearest neighbor search
-- Lists parameter: sqrt(total_rows) is a good starting point

-- Conversation embeddings index
CREATE INDEX CONCURRENTLY IF NOT EXISTS conversation_embeddings_embedding_vector_idx 
ON conversation_embeddings 
USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);

-- RAG documents index
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_documents_embedding_vector_idx 
ON rag_documents 
USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);

-- User uploads index
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_uploads_embedding_vector_idx 
ON user_uploads 
USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);

-- Asset history index
CREATE INDEX CONCURRENTLY IF NOT EXISTS asset_history_content_embedding_vector_idx 
ON asset_history 
USING ivfflat (content_embedding_vector vector_cosine_ops) 
WITH (lists = 50);

-- Create composite indexes for filtered vector searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS conversation_embeddings_user_org_vector_idx
ON conversation_embeddings (user_id, org_id, security_level) 
INCLUDE (embedding_vector);

CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_documents_security_source_vector_idx
ON rag_documents (security_level, content_source, processing_status) 
INCLUDE (embedding_vector);

-- Create HNSW indexes for exact nearest neighbor search (if preferred)
-- Uncomment these for better accuracy but slower inserts
/*
CREATE INDEX CONCURRENTLY conversation_embeddings_embedding_vector_hnsw_idx 
ON conversation_embeddings 
USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY rag_documents_embedding_vector_hnsw_idx 
ON rag_documents 
USING hnsw (embedding_vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);
*/

COMMIT; 