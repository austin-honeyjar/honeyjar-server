#!/usr/bin/env tsx
import { db } from '../src/db/index.js';
import { ragDocuments } from '../src/db/schema.js';
import { sql, isNull, isNotNull } from 'drizzle-orm';
import logger from '../src/utils/logger.js';

async function migrateWorkflowContext() {
  console.log('🔄 Migrating workflow context to pgvector format...\n');
  
  try {
    // Find documents with old embedding format but no pgvector format
    const documentsToMigrate = await db.select({
      id: ragDocuments.id,
      filename: ragDocuments.filename,
      embedding: ragDocuments.embedding,
      embeddingVector: ragDocuments.embeddingVector
    })
    .from(ragDocuments)
    .where(sql`
      embedding IS NOT NULL 
      AND (embedding_vector IS NULL OR embedding_vector = '')
      AND content_source = 'admin_global'
    `);

    console.log(`📊 Found ${documentsToMigrate.length} documents to migrate:`);
    
    if (documentsToMigrate.length === 0) {
      console.log('✅ No documents need migration\n');
      return;
    }

    for (const doc of documentsToMigrate) {
      console.log(`   🔄 Migrating: ${doc.filename} (ID: ${doc.id})`);
      
      try {
        // Parse the JSON embedding
        const embeddingArray = JSON.parse(doc.embedding || '[]');
        
        if (Array.isArray(embeddingArray) && embeddingArray.length > 0) {
          // Convert to pgvector format
          const vectorString = `[${embeddingArray.join(',')}]`;
          
          // Update the record
          await db.update(ragDocuments)
            .set({
              embeddingVector: vectorString,
              embeddingProvider: 'openai'
            })
            .where(sql`id = ${doc.id}`);
          
          console.log(`   ✅ Migrated successfully (${embeddingArray.length} dimensions)`);
        } else {
          console.log(`   ❌ Invalid embedding format for ${doc.filename}`);
        }
      } catch (parseError) {
        console.log(`   ❌ Failed to parse embedding for ${doc.filename}:`, parseError);
      }
    }

    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const migratedDocs = await db.select({
      id: ragDocuments.id,
      filename: ragDocuments.filename,
      hasOldEmbedding: sql`CASE WHEN embedding IS NOT NULL THEN true ELSE false END`.as('hasOldEmbedding'),
      hasVectorEmbedding: sql`CASE WHEN embedding_vector IS NOT NULL AND embedding_vector != '' THEN true ELSE false END`.as('hasVectorEmbedding')
    })
    .from(ragDocuments)
    .where(sql`content_source = 'admin_global'`);

    console.log('\n📋 Migration Results:');
    migratedDocs.forEach(doc => {
      const status = doc.hasVectorEmbedding ? '✅' : '❌';
      console.log(`   ${status} ${doc.filename}: Vector=${doc.hasVectorEmbedding}, Legacy=${doc.hasOldEmbedding}`);
    });

    console.log('\n🎉 Workflow context migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
  
  process.exit(0);
}

migrateWorkflowContext().catch(console.error); 