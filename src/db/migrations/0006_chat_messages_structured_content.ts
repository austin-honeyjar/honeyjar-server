import { sql } from 'drizzle-orm';

export const up = async (db: any) => {
  // First, add a new JSONB column for structured content
  await db.execute(sql`
    ALTER TABLE chat_messages 
    ADD COLUMN content_structured JSONB;
  `);

  // Migrate existing text content to structured format
  // We'll wrap existing string content in a basic structure
  await db.execute(sql`
    UPDATE chat_messages 
    SET content_structured = jsonb_build_object(
      'type', 'text',
      'text', content,
      'decorators', '[]'::jsonb,
      'metadata', '{}'::jsonb
    )
    WHERE content_structured IS NULL;
  `);

  // Make the new column NOT NULL now that all rows have values
  await db.execute(sql`
    ALTER TABLE chat_messages 
    ALTER COLUMN content_structured SET NOT NULL;
  `);

  // Drop the old text column
  await db.execute(sql`
    ALTER TABLE chat_messages 
    DROP COLUMN content;
  `);

  // Rename the new column to content
  await db.execute(sql`
    ALTER TABLE chat_messages 
    RENAME COLUMN content_structured TO content;
  `);

  console.log('Successfully migrated chat_messages.content to JSONB structured format');
};

export const down = async (db: any) => {
  // Add back the text column
  await db.execute(sql`
    ALTER TABLE chat_messages 
    ADD COLUMN content_text TEXT;
  `);

  // Convert structured content back to text
  // Extract the 'text' field from the JSON structure
  await db.execute(sql`
    UPDATE chat_messages 
    SET content_text = content->>'text'
    WHERE content_text IS NULL;
  `);

  // Make the text column NOT NULL
  await db.execute(sql`
    ALTER TABLE chat_messages 
    ALTER COLUMN content_text SET NOT NULL;
  `);

  // Drop the JSONB column
  await db.execute(sql`
    ALTER TABLE chat_messages 
    DROP COLUMN content;
  `);

  // Rename the text column back to content
  await db.execute(sql`
    ALTER TABLE chat_messages 
    RENAME COLUMN content_text TO content;
  `);

  console.log('Successfully reverted chat_messages.content back to TEXT format');
}; 