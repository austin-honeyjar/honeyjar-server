#!/usr/bin/env tsx
import { db } from '../src/db/index.js';
import { ragDocuments } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { WorkflowContextService } from '../src/services/workflowContextService.js';
import logger from '../src/utils/logger.js';

async function reinitializeWorkflowContext() {
  console.log('🔄 Reinitializing workflow context with pgvector format...\n');
  
  try {
    // Step 1: Remove existing workflow context documents
    console.log('1️⃣ Removing existing workflow context documents...');
    
    const deletedDocs = await db.delete(ragDocuments)
      .where(sql`
        content_source = 'admin_global' 
        AND (filename LIKE '%workflow%' OR content_category = 'system-context')
      `)
      .returning({ id: ragDocuments.id, filename: ragDocuments.filename });

    console.log(`   ✅ Removed ${deletedDocs.length} old documents:`);
    deletedDocs.forEach(doc => {
      console.log(`      - ${doc.filename} (ID: ${doc.id})`);
    });

    // Step 2: Initialize WorkflowContextService and recreate context
    console.log('\n2️⃣ Recreating workflow context with pgvector format...');
    
    const workflowContextService = new WorkflowContextService();
    
    // This will create the workflow context with the new pgvector format
    await workflowContextService.initializeSystemContext();
    
    console.log('   ✅ Workflow context recreated successfully');

    // Step 3: Verify the new context
    console.log('\n3️⃣ Verifying new workflow context...');
    
    const newDocs = await db.select({
      id: ragDocuments.id,
      filename: ragDocuments.filename,
      contentSource: ragDocuments.contentSource,
      contentCategory: ragDocuments.contentCategory,
      hasVectorEmbedding: sql`CASE WHEN embedding_vector IS NOT NULL AND embedding_vector != '' THEN true ELSE false END`.as('hasVectorEmbedding'),
      embeddingProvider: ragDocuments.embeddingProvider
    })
    .from(ragDocuments)
    .where(sql`content_source = 'admin_global'`);

    console.log('\n📋 New Context Documents:');
    newDocs.forEach(doc => {
      const status = doc.hasVectorEmbedding ? '✅' : '❌';
      console.log(`   ${status} ${doc.filename}`);
      console.log(`      Source: ${doc.contentSource}, Category: ${doc.contentCategory}`);
      console.log(`      Vector: ${doc.hasVectorEmbedding}, Provider: ${doc.embeddingProvider}`);
    });

    // Step 4: Test the context validation
    console.log('\n4️⃣ Testing context validation...');
    const isValid = await workflowContextService.validateWorkflowContext();
    console.log(`   ${isValid ? '✅' : '❌'} Context validation: ${isValid ? 'Valid' : 'Invalid'}`);

    console.log('\n🎉 Workflow context reinitialization completed successfully!');
    console.log('\n💡 You can now run: npm run test:workflow-context');
    
  } catch (error) {
    console.error('❌ Reinitialization failed:', error);
    throw error;
  }
  
  process.exit(0);
}

reinitializeWorkflowContext().catch(console.error); 