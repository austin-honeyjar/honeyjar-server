-- Migration to add OpenAI tracking columns to workflow_steps table
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS openai_prompt TEXT;
ALTER TABLE workflow_steps ADD COLUMN IF NOT EXISTS openai_response TEXT;

-- Update the comment on the new columns
COMMENT ON COLUMN workflow_steps.openai_prompt IS 'The complete prompt sent to OpenAI';
COMMENT ON COLUMN workflow_steps.openai_response IS 'The raw response received from OpenAI'; 