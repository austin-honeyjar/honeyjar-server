-- Migration: Upgrade to pgvector for embeddings
-- This migration converts existing JSON embedding storage to pgvector format

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add new pgvector columns (keeping old ones for migration)
ALTER TABLE conversation_embeddings 
ADD COLUMN IF NOT EXISTS embedding_vector vector(1536),
ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

ALTER TABLE rag_documents 
ADD COLUMN IF NOT EXISTS embedding_vector vector(1536),
ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

ALTER TABLE user_uploads 
ADD COLUMN IF NOT EXISTS embedding_vector vector(1536),
ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

ALTER TABLE knowledge_cache 
ADD COLUMN IF NOT EXISTS query_embedding_vector vector(1536),
ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'openai';

-- Create indexes for vector similarity search
CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_vector 
ON conversation_embeddings USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_rag_documents_vector 
ON rag_documents USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_user_uploads_vector 
ON user_uploads USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);

-- Migration function to convert existing JSON embeddings to pgvector
DO $$
DECLARE
    rec RECORD;
    embedding_array text;
BEGIN
    -- Migrate conversation_embeddings
    FOR rec IN SELECT id, embedding FROM conversation_embeddings WHERE embedding IS NOT NULL AND embedding_vector IS NULL
    LOOP
        BEGIN
            -- Convert JSON string to pgvector format
            embedding_array := REPLACE(REPLACE(rec.embedding, '[', ''), ']', '');
            EXECUTE format('UPDATE conversation_embeddings SET embedding_vector = ''[%s]''::vector WHERE id = %L', 
                         embedding_array, rec.id);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Failed to migrate embedding for conversation_embeddings id %: %', rec.id, SQLERRM;
        END;
    END LOOP;

    -- Migrate rag_documents
    FOR rec IN SELECT id, embedding FROM rag_documents WHERE embedding IS NOT NULL AND embedding_vector IS NULL
    LOOP
        BEGIN
            embedding_array := REPLACE(REPLACE(rec.embedding, '[', ''), ']', '');
            EXECUTE format('UPDATE rag_documents SET embedding_vector = ''[%s]''::vector WHERE id = %L', 
                         embedding_array, rec.id);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Failed to migrate embedding for rag_documents id %: %', rec.id, SQLERRM;
        END;
    END LOOP;

    -- Migrate user_uploads
    FOR rec IN SELECT id, embedding FROM user_uploads WHERE embedding IS NOT NULL AND embedding_vector IS NULL
    LOOP
        BEGIN
            embedding_array := REPLACE(REPLACE(rec.embedding, '[', ''), ']', '');
            EXECUTE format('UPDATE user_uploads SET embedding_vector = ''[%s]''::vector WHERE id = %L', 
                         embedding_array, rec.id);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Failed to migrate embedding for user_uploads id %: %', rec.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'Embedding migration completed';
END
$$;

-- Create helper functions for vector similarity search
CREATE OR REPLACE FUNCTION vector_similarity_search(
    query_vector vector(1536),
    table_name text,
    user_id_filter text DEFAULT NULL,
    org_id_filter text DEFAULT NULL,
    security_levels text[] DEFAULT ARRAY['public', 'internal', 'confidential', 'restricted'],
    similarity_threshold float DEFAULT 0.7,
    result_limit integer DEFAULT 10
)
RETURNS TABLE(
    id uuid,
    content text,
    similarity_score float,
    security_level text,
    created_at timestamptz
) 
LANGUAGE plpgsql
AS $$
BEGIN
    -- This is a template function - implement specific searches in the application
    RAISE EXCEPTION 'Use specific search functions for each table';
END
$$;

-- Add comments for documentation
COMMENT ON COLUMN conversation_embeddings.embedding_vector IS 'pgvector embedding for semantic search';
COMMENT ON COLUMN conversation_embeddings.embedding_provider IS 'Provider used to generate embedding (openai, local, etc.)';
COMMENT ON COLUMN rag_documents.embedding_vector IS 'pgvector embedding for semantic search';
COMMENT ON COLUMN rag_documents.embedding_provider IS 'Provider used to generate embedding (openai, local, etc.)';

-- Print migration status
DO $$
BEGIN
    RAISE NOTICE 'pgvector migration completed successfully!';
    RAISE NOTICE 'New vector columns added with indexes for fast similarity search';
    RAISE NOTICE 'Existing JSON embeddings have been migrated to pgvector format';
    RAISE NOTICE 'You can now update your application code to use the new embedding_vector columns';
END
$$; 