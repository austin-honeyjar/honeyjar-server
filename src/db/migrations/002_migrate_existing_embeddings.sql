-- migrations/002_migrate_existing_embeddings.sql
-- Migrate existing JSON embeddings to pgvector format

BEGIN;

-- Migrate conversation embeddings
UPDATE conversation_embeddings 
SET embedding_vector = embedding::vector
WHERE embedding IS NOT NULL 
  AND embedding != '' 
  AND json_array_length(embedding::json) = 1536;

-- Migrate RAG document embeddings
UPDATE rag_documents 
SET embedding_vector = embedding::vector
WHERE embedding IS NOT NULL 
  AND embedding != '' 
  AND json_array_length(embedding::json) = 1536;

-- Migrate user upload embeddings
UPDATE user_uploads 
SET embedding_vector = embedding::vector
WHERE embedding IS NOT NULL 
  AND embedding != '' 
  AND json_array_length(embedding::json) = 1536;

-- Migrate asset history embeddings (if any exist)
UPDATE asset_history 
SET content_embedding_vector = embedding::vector
WHERE embedding IS NOT NULL 
  AND embedding != '' 
  AND json_array_length(embedding::json) = 1536;

-- Verify migration results
SELECT 
  'conversation_embeddings' as table_name,
  COUNT(*) as total_rows,
  COUNT(embedding) as text_embeddings,
  COUNT(embedding_vector) as vector_embeddings,
  COUNT(CASE WHEN embedding IS NOT NULL AND embedding_vector IS NULL THEN 1 END) as failed_migrations
FROM conversation_embeddings
UNION ALL
SELECT 
  'rag_documents',
  COUNT(*),
  COUNT(embedding),
  COUNT(embedding_vector),
  COUNT(CASE WHEN embedding IS NOT NULL AND embedding_vector IS NULL THEN 1 END)
FROM rag_documents
UNION ALL
SELECT 
  'user_uploads',
  COUNT(*),
  COUNT(embedding),
  COUNT(embedding_vector),
  COUNT(CASE WHEN embedding IS NOT NULL AND embedding_vector IS NULL THEN 1 END)
FROM user_uploads
UNION ALL
SELECT 
  'asset_history',
  COUNT(*),
  COUNT(embedding),
  COUNT(content_embedding_vector),
  COUNT(CASE WHEN embedding IS NOT NULL AND content_embedding_vector IS NULL THEN 1 END)
FROM asset_history;

COMMIT; 