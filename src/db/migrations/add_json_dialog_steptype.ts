import { sql } from 'drizzle-orm';

export const up = async (db: any) => {
  // First check if the JSON_DIALOG step type exists
  const stepTypeEnumCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_type 
      JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'step_type' 
      AND pg_enum.enumlabel = 'json_dialog'
    );
  `);
  
  // If it doesn't exist, add it
  if (!stepTypeEnumCheck[0]?.exists) {
    console.log('Adding JSON_DIALOG to step_type enum...');
    try {
      await db.execute(sql`
        ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'json_dialog';
      `);
      console.log('JSON_DIALOG added to step_type enum successfully');
    } catch (enumError) {
      console.error('Error adding JSON_DIALOG to step_type enum:', enumError);
      
      // Alternative approach for PostgreSQL versions that don't support ADD VALUE
      console.log('Trying alternative approach to update step_type enum...');
      await db.execute(sql`
        -- Create a new enum type with all values including the new one
        CREATE TYPE step_type_new AS ENUM ('ai_suggestion', 'user_input', 'api_call', 'data_transformation', 'asset_creation', 'json_dialog');
        
        -- Update the workflow_steps table to use the new enum
        ALTER TABLE workflow_steps 
          ALTER COLUMN step_type TYPE step_type_new 
          USING step_type::text::step_type_new;
        
        -- Drop the old enum type
        DROP TYPE step_type;
        
        -- Rename the new enum type to the original name
        ALTER TYPE step_type_new RENAME TO step_type;
      `);
      console.log('step_type enum updated successfully using alternative method');
    }
  } else {
    console.log('JSON_DIALOG already exists in step_type enum');
  }
};

export const down = async (db: any) => {
  // NOTE: It's not generally possible to remove an enum value in PostgreSQL
  // This is a no-op for the down migration
  console.log('Cannot remove enum value (not supported in PostgreSQL). No changes made.');
}; 