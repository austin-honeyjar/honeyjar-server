-- Drop foreign key constraints
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_thread_id_chat_threads_id_fk;
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_thread_id_chat_threads_id_fk;

-- Create temporary tables to store existing data
CREATE TEMP TABLE temp_chat_threads AS SELECT * FROM chat_threads;
CREATE TEMP TABLE temp_chat_messages AS SELECT * FROM chat_messages;
CREATE TEMP TABLE temp_workflows AS SELECT * FROM workflows;

-- Drop and recreate chat_threads table with new column
DROP TABLE chat_threads CASCADE;
CREATE TABLE chat_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    org_id text NOT NULL,
    title text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Restore data from temporary tables with the new org_id
INSERT INTO chat_threads (id, user_id, title, created_at, org_id)
SELECT id, user_id, title, created_at, 'org_2vuz80ITNxvPdab8CFyCpbfZjTf'
FROM temp_chat_threads;

-- Restore chat_messages with foreign key constraint
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_thread_id_chat_threads_id_fk 
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id);

-- Restore workflows with foreign key constraint
ALTER TABLE workflows ADD CONSTRAINT workflows_thread_id_chat_threads_id_fk 
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id); 