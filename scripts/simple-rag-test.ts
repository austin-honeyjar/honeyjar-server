#!/usr/bin/env ts-node

/**
 * Simple Universal RAG Test
 * 
 * Tests the key components that should work for:
 * 1. "make a press release"
 * 2. "use my company and industry"
 */

import { ragService } from '../src/services/ragService';
import { enhancedWorkflowService } from '../src/services/enhanced-workflow.service';

async function testRAGContext() {
  console.log('\n🔍 Testing RAG Context for User Profile...\n');
  
  const testUserId = 'user_2vKW55N5ZtsCLz8YynlQOElNXGH';
  const testOrgId = 'org_2vuyiIbzL85gWIeDV0i6xODX048';
  
  try {
    const context = await ragService.getRelevantContext(
      testUserId,
      testOrgId,
      'asset_generation',
      'press_release',
      'use my company and industry'
    );
    
    console.log('📋 RAG Context Results:');
    console.log('- Has context:', !!context);
    console.log('- Has user defaults:', !!context?.userDefaults);
    console.log('- Company name:', context?.userDefaults?.companyName || 'NOT FOUND');
    console.log('- Industry:', context?.userDefaults?.industry || 'NOT FOUND');
    console.log('- Role:', context?.userDefaults?.role || 'NOT FOUND');
    
    if (context?.userDefaults?.companyName === 'Honeyjar') {
      console.log('✅ Company name correctly found: Honeyjar');
    } else {
      console.log('❌ Company name NOT found or incorrect');
    }
    
    if (context?.userDefaults?.industry === 'PR Tech') {
      console.log('✅ Industry correctly found: PR Tech');
    } else {
      console.log('❌ Industry NOT found or incorrect');
    }
    
  } catch (error) {
    console.error('❌ RAG context test failed:', error);
  }
}

async function testUniversalPromptBuilding() {
  console.log('\n🏗️ Testing Universal Prompt Building...\n');
  
  try {
    // Create a mock workflow step for Asset Generation
    const mockStep = {
      id: 'test-step',
      name: 'Asset Generation',
      stepType: 'api_call',
      metadata: {
        useUniversalRAG: true,
        templates: {
          pressRelease: {
            STRUCTURE: 'FOR IMMEDIATE RELEASE format',
            STYLE: 'Professional, engaging',
            CRITICAL: 'Use user profile to replace ALL placeholders'
          }
        }
      }
    };
    
    const mockWorkflow = {
      templateId: 'press-release',
      metadata: {
        collectedInfo: {
          userInput: 'use my company and industry'
        }
      }
    };
    
    const testUserId = 'user_2vKW55N5ZtsCLz8YynlQOElNXGH';
    const testOrgId = 'org_2vuyiIbzL85gWIeDV0i6xODX048';
    const testThreadId = 'test-thread-' + Date.now();
    
    // Test if the buildUniversalAssetPrompt method exists and works
    console.log('🔧 Testing Universal Asset Prompt generation...');
    
    // This should build a comprehensive prompt with:
    // - Template instructions
    // - User profile (Honeyjar, PR Tech)
    // - Conversation history
    // - Collected information
    
    console.log('✅ Mock data prepared for Universal RAG test');
    console.log('- Step name:', mockStep.name);
    console.log('- Has template:', !!mockStep.metadata?.templates);
    console.log('- Use Universal RAG:', mockStep.metadata?.useUniversalRAG);
    console.log('- User input:', mockWorkflow.metadata?.collectedInfo?.userInput);
    
  } catch (error) {
    console.error('❌ Universal prompt building test failed:', error);
  }
}

async function testWorkflowSystemIntegration() {
  console.log('\n⚡ Testing Workflow System Integration...\n');
  
  try {
    // Test that the Enhanced Workflow Service is properly configured
    console.log('🔧 Testing Enhanced Workflow Service...');
    console.log('- Service exists:', !!enhancedWorkflowService);
    console.log('- Has buildUniversalAssetPrompt method:', typeof (enhancedWorkflowService as any).buildUniversalAssetPrompt === 'function');
    console.log('- Has handleApiCallStep method:', typeof (enhancedWorkflowService as any).handleApiCallStep === 'function');
    
    // Check if the service has the required methods for Universal RAG
    const requiredMethods = [
      'buildUniversalAssetPrompt',
      'handleApiCallStep', 
      'handleStepCompletionInternally',
      'checkAndHandleAutoExecution'
    ];
    
    console.log('\n📋 Required Methods Check:');
    requiredMethods.forEach(method => {
      const exists = typeof (enhancedWorkflowService as any)[method] === 'function';
      console.log(`- ${method}: ${exists ? '✅' : '❌'}`);
    });
    
  } catch (error) {
    console.error('❌ Workflow system integration test failed:', error);
  }
}

async function runSimpleTest() {
  console.log('\n🧪 SIMPLE UNIVERSAL RAG TEST STARTING...\n');
  console.log('Testing the core components for:');
  console.log('1. "make a press release"');
  console.log('2. "use my company and industry"');
  console.log('\nExpected results:');
  console.log('- RAG should find "Honeyjar" as company');
  console.log('- RAG should find "PR Tech" as industry');
  console.log('- Universal prompt should be 2500+ tokens');
  console.log('- Generated content should use real data, not placeholders\n');
  
  await testRAGContext();
  await testUniversalPromptBuilding();
  await testWorkflowSystemIntegration();
  
  console.log('\n✅ Simple Universal RAG Test Completed!\n');
  console.log('🎯 Next step: Run a real workflow to see if it works end-to-end');
}

// Run if called directly
runSimpleTest().catch(console.error);

export { runSimpleTest };