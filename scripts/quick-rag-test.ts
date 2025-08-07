#!/usr/bin/env tsx
import { RAGService } from '../src/services/ragService.js';
import logger from '../src/utils/logger.js';

// Quick RAG System Test
async function quickRAGTest() {
  console.log('🚀 Quick RAG System Test\n');
  
  const ragService = new RAGService();
  const testUserId = 'test-user-' + Date.now();
  const testOrgId = 'test-org-' + Date.now();
  
  try {
    // Test 1: Check available RAG documents
    console.log('1️⃣ Testing available RAG documents...');
    const availableDocs = await ragService.getAvailableRagDocuments(testUserId, testOrgId);
    console.log(`   Found ${availableDocs.length} total documents`);
    
    const globalDocs = availableDocs.filter(doc => doc.source === 'admin_global');
    const userDocs = availableDocs.filter(doc => doc.source === 'user_personal');
    
    console.log(`   - Global docs (admin_global): ${globalDocs.length}`);
    console.log(`   - User docs (user_personal): ${userDocs.length}`);
    
    if (globalDocs.length > 0) {
      console.log('   Global document categories:', [...new Set(globalDocs.map(d => d.contentCategory))]);
    }
    
    // Test 2: Test global context retrieval (workflow knowledge)
    console.log('\n2️⃣ Testing global workflow context retrieval...');
    const globalWorkflowQueries = [
      'blog article workflow content brief',
      'press release structure guidelines',
      'social media best practices'
    ];
    
    for (const query of globalWorkflowQueries) {
      const globalResults = await ragService.searchSecureContent(
        testUserId, testOrgId, query,
        { 
          contentTypes: ['rag_document'], 
          securityLevel: 'public',
          limit: 3
        }
      );
      
      const adminGlobalResults = globalResults.filter(r => r.context?.contentSource === 'admin_global');
      console.log(`   Query: "${query}" -> ${adminGlobalResults.length} global results`);
      
      if (adminGlobalResults.length > 0) {
        const topResult = adminGlobalResults[0];
        console.log(`     Best match (${topResult.relevanceScore.toFixed(2)}): ${topResult.content.substring(0, 100)}...`);
      }
    }
    
    // Test 3: Test organization context retrieval
    console.log('\n3️⃣ Testing organization context retrieval...');
    const orgContext = await ragService.getRelevantContext(
      testUserId, testOrgId, 'Blog Article', 'Asset Generation',
      'Create content about our company services'
    );
    
    console.log(`   User defaults: ${Object.keys(orgContext.userDefaults || {}).length} fields`);
    console.log(`   Related conversations: ${orgContext.relatedConversations?.length || 0}`);
    console.log(`   Similar assets: ${orgContext.similarAssets?.length || 0}`);
    
    if (orgContext.userDefaults?.companyName) {
      console.log(`   Company: ${orgContext.userDefaults.companyName}`);
    }
    
    // Test 4: Test dual RAG retrieval simulation
    console.log('\n4️⃣ Testing dual RAG retrieval (simulated)...');
    const workflowType = 'Blog Article';
    const stepName = 'Asset Generation';
    const userInput = 'Create a blog about AI automation for manufacturing';
    
    // Global workflow knowledge call
    const globalContextCall = await ragService.searchSecureContent(
      testUserId, testOrgId, `${workflowType} workflow ${stepName} best practices`,
      { 
        contentTypes: ['rag_document'], 
        securityLevel: 'public',
        limit: 3
      }
    );
    
    // Organization context call
    const orgContextCall = await ragService.searchSecureContent(
      testUserId, testOrgId, `${userInput} company brand messaging`,
      { 
        contentTypes: ['rag_document', 'conversation'], 
        securityLevel: 'internal',
        limit: 3
      }
    );
    
    const globalOnly = globalContextCall.filter(r => r.context?.contentSource === 'admin_global');
    const orgOnly = orgContextCall.filter(r => 
      r.context?.contentSource === 'user_personal' || r.source === 'conversation'
    );
    
    console.log(`   Global workflow context: ${globalOnly.length} results`);
    console.log(`   Organization context: ${orgOnly.length} results`);
    console.log(`   Combined context sources: ${globalOnly.length + orgOnly.length} total`);
    
    // Test 5: Test context injection simulation  
    console.log('\n5️⃣ Testing context injection simulation...');
    const baseInstructions = 'Create a comprehensive blog article about industry trends.';
    
    let contextHeader = '\n=== 🎯 DUAL RAG CONTEXT ===\n';
    
    if (globalOnly.length > 0) {
      contextHeader += '📚 WORKFLOW KNOWLEDGE:\n';
      globalOnly.forEach(ctx => {
        contextHeader += `• ${ctx.content.substring(0, 80)}...\n`;
      });
    }
    
    if (orgOnly.length > 0) {
      contextHeader += '🏢 COMPANY CONTEXT:\n';
      orgOnly.forEach(ctx => {
        contextHeader += `• ${ctx.content.substring(0, 80)}...\n`;
      });
    }
    
    contextHeader += '=== END CONTEXT ===\n\n';
    const enhancedInstructions = contextHeader + baseInstructions;
    
    console.log(`   Original instructions: ${baseInstructions.length} chars`);
    console.log(`   Enhanced instructions: ${enhancedInstructions.length} chars`);
    console.log(`   Context expansion: ${(enhancedInstructions.length / baseInstructions.length).toFixed(1)}x`);
    
    // Test 6: Performance check
    console.log('\n6️⃣ Testing performance...');
    const perfStart = Date.now();
    
    await Promise.all([
      ragService.searchSecureContent(testUserId, testOrgId, 'workflow guidance', { limit: 2 }),
      ragService.searchSecureContent(testUserId, testOrgId, 'company context', { limit: 2 })
    ]);
    
    const perfEnd = Date.now();
    console.log(`   Dual RAG call performance: ${perfEnd - perfStart}ms`);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 QUICK TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Total documents available: ${availableDocs.length}`);
    console.log(`📚 Global workflow docs: ${globalDocs.length}`);
    console.log(`🏢 Organization docs: ${userDocs.length}`);
    console.log(`⚡ Performance: ${perfEnd - perfStart}ms for dual calls`);
    console.log(`🎯 System status: ${availableDocs.length > 0 ? 'READY' : 'NEEDS SETUP'}`);
    
    if (globalDocs.length === 0) {
      console.log('\n⚠️  RECOMMENDATION: Upload global workflow documents first');
      console.log('   Use the admin upload endpoint to add workflow templates');
    }
    
    if (userDocs.length === 0) {
      console.log('\n💡 SUGGESTION: Add organization-specific documents for better testing');
      console.log('   Upload company brand guidelines, case studies, etc.');
    }
    
    console.log('\n🚀 Next steps:');
    console.log('   1. Run comprehensive test: npm run test:rag');
    console.log('   2. Visit test dashboard: /test-dashboard');
    console.log('   3. Test in workflows with Dev Mode enabled');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
quickRAGTest().then(() => {
  console.log('\n✅ Quick RAG test completed!');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test error:', error);
  process.exit(1);
}); 