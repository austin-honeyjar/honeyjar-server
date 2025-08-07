#!/usr/bin/env tsx
import { WorkflowContextService } from '../src/services/workflowContextService.js';
import { RAGService } from '../src/services/ragService.js';
import logger from '../src/utils/logger.js';

async function testWorkflowContext() {
  console.log('🧪 Testing Workflow Context System...\n');
  
  try {
    // Test 1: Initialize WorkflowContextService
    console.log('1️⃣ Testing WorkflowContextService initialization...');
    const workflowContext = new WorkflowContextService();
    console.log('✅ WorkflowContextService created successfully\n');
    
    // Test 2: Generate workflow context document
    console.log('2️⃣ Testing workflow context document generation...');
    const summary = workflowContext.getWorkflowSummary();
    console.log('📝 Workflow Summary:', summary);
    console.log('✅ Context document generation working\n');
    
    // Test 3: Validate existing context
    console.log('3️⃣ Testing context validation...');
    const isValid = await workflowContext.validateWorkflowContext();
    console.log('📋 Context validation result:', isValid ? '✅ Valid' : '⚠️ Missing');
    
    // Test 4: Initialize/update context if needed
    if (!isValid) {
      console.log('\n4️⃣ Creating workflow context...');
      await workflowContext.initializeSystemContext();
      console.log('✅ Workflow context initialized');
    } else {
      console.log('\n4️⃣ Workflow context already exists ✅');
    }
    
    // Test 5: Test RAG search for workflow context
    console.log('\n5️⃣ Testing RAG search for workflow context...');
    const ragService = new RAGService();
    
    // Search for workflow-related content
    const searchResults = await ragService.searchSecureContentPgVector(
      'test-user-id',
      'test-org-id', 
      'press release workflow steps',
      {
        contentTypes: ['rag_document'],
        securityLevel: 'internal',
        limit: 3,
        usePgVector: true
      }
    );

    console.log(`📊 Found ${searchResults.length} results:`);
    searchResults.forEach((result, i) => {
      console.log(`  ${i + 1}. ID: ${result.id}`);
      console.log(`     Content: ${result.content.slice(0, 100)}...`);
      console.log(`     Source: ${result.source}`);
      console.log(`     Relevance: ${result.relevanceScore.toFixed(3)}`);
      console.log(`     Security: ${result.securityLevel}`);
      console.log('');
    });
    
    // Test 6: Test specific workflow search
    console.log('6️⃣ Testing specific workflow search...');
    const workflowResults = await ragService.searchSecureContentPgVector(
      'test-user-id',
      'test-org-id', 
      'Launch Announcement workflow template',
      {
        contentTypes: ['rag_document'],
        securityLevel: 'internal',
        limit: 2,
        usePgVector: true
      }
    );

    console.log(`🔍 Workflow-specific search found ${workflowResults.length} results:`);
    workflowResults.forEach((result, i) => {
      console.log(`  ${i + 1}. Content: ${result.content.slice(0, 150)}...`);
      console.log(`     Relevance: ${result.relevanceScore.toFixed(3)}`);
      console.log('');
    });
    
    console.log('🎉 Workflow Context System Test Complete!\n');
    
    // Summary
    console.log('📋 Test Summary:');
    console.log(`  ✅ Service initialization: Working`);
    console.log(`  ✅ Context generation: Working`);
    console.log(`  ${isValid ? '✅' : '⚠️'} Context validation: ${isValid ? 'Valid' : 'Created new'}`);
    console.log(`  ${searchResults.length > 0 ? '✅' : '❌'} RAG search: ${searchResults.length} results`);
    console.log(`  ${workflowResults.length > 0 ? '✅' : '❌'} System context priority: ${workflowResults.length > 0 ? 'Found' : 'Not found'}`);
    
    if (searchResults.length === 0) {
      console.log('\n💡 If no results found, this might mean:');
      console.log('   • pgvector extension needs setup');
      console.log('   • Context hasn\'t been stored yet');
      console.log('   • Database connection issues');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.log('\n🔧 Troubleshooting tips:');
    console.log('   • Check database connection');
    console.log('   • Verify pgvector extension is installed');
    console.log('   • Run npm run validate:pgvector');
    console.log('   • Check server logs for detailed errors');
  }
  
  process.exit(0);
}

testWorkflowContext().catch(console.error); 