-- Add org_id column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_threads' AND column_name = 'org_id') THEN
        ALTER TABLE chat_threads ADD COLUMN org_id text;
    END IF;
END $$;

-- Update existing rows with the organization ID
UPDATE chat_threads SET org_id = 'org_2vuz80ITNxvPdab8CFyCpbfZjTf' WHERE org_id IS NULL;

-- Make the column NOT NULL
ALTER TABLE chat_threads ALTER COLUMN org_id SET NOT NULL; 