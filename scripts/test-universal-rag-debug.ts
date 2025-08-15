#!/usr/bin/env ts-node

/**
 * Universal RAG + Template Debug Test
 * 
 * Simulates the exact user workflow:
 * 1. "make a press release" 
 * 2. "use my company and industry"
 * 
 * Uses the actual streaming endpoint to test Universal RAG + Template integration
 */

import { enhancedWorkflowService } from '../src/services/enhanced-workflow.service';
import { ragService } from '../src/services/ragService';

class UniversalRAGDebugTest {
  private testUserId = 'user_2vKW55N5ZtsCLz8YynlQOElNXGH';
  private testOrgId = 'org_2vuyiIbzL85gWIeDV0i6xODX048';
  private testThreadId: string = '';
  private workflowId: string = '';

  async runDebugTest() {
    console.log('\n🧪 UNIVERSAL RAG DEBUG TEST STARTING...\n');
    
    try {
      // Step 1: Test RAG context availability
      await this.checkRAGContext();
      
      // Step 2: Test direct workflow creation (simpler approach)
      await this.testDirectWorkflowCreation();
      
      // Step 3: Test Asset Generation step directly 
      await this.testAssetGenerationStep();
      
      console.log('\n✅ Universal RAG Debug Test Completed!\n');
      
    } catch (error) {
      console.error('\n❌ Universal RAG Debug Test Failed:', error);
      throw error;
    }
  }

  private async createTestThread() {
    console.log('📝 Creating test thread...');
    
    // Create a unique thread ID for this test
    this.testThreadId = `test-thread-${Date.now()}`;
    
    console.log(`✅ Test thread created: ${this.testThreadId.substring(0, 8)}...\n`);
  }

  private async testInitialPressReleaseRequest() {
    console.log('🎯 Testing: "make a press release"...\n');
    
    try {
      // This should start a Press Release workflow
      const response = await enhancedWorkflowService.handleUserMessage(
        this.testThreadId,
        'make a press release',
        this.testUserId,
        this.testOrgId
      );
      
      console.log('📊 Initial Request Response:', {
        hasResponse: !!response,
        responseLength: response?.length || 0,
        responsePreview: response?.substring(0, 200) + '...'
      });
      
      // Get workflow info
      const workflows = await enhancedWorkflowService.getWorkflowByThreadId(this.testThreadId);
      if (workflows) {
        this.workflowId = workflows.id;
        console.log('🔄 Workflow Created:', {
          workflowId: this.workflowId.substring(0, 8),
          templateId: workflows.templateId,
          status: workflows.status
        });
        
        // Get current step
        const currentStep = await enhancedWorkflowService.getCurrentStepForThread(this.testThreadId);
        console.log('📍 Current Step:', {
          stepName: currentStep?.name,
          stepType: currentStep?.stepType,
          stepOrder: currentStep?.order
        });
      }
      
      console.log('✅ Initial request completed\n');
      
    } catch (error) {
      console.error('❌ Initial request failed:', error);
      throw error;
    }
  }

  private async testCompanyIndustryResponse() {
    console.log('🏢 Testing: "use my company and industry"...\n');
    
    try {
      // First, let's check RAG context availability
      await this.checkRAGContext();
      
      // This should trigger Universal RAG + Template system
      console.log('🚀 Sending company/industry request...');
      
      const response = await enhancedWorkflowService.handleUserMessage(
        this.testThreadId,
        'use my company and industry',
        this.testUserId,
        this.testOrgId
      );
      
      console.log('📊 Company/Industry Response:', {
        hasResponse: !!response,
        responseLength: response?.length || 0,
        containsHoneyjar: response?.includes('Honeyjar') || false,
        containsPRTech: response?.includes('PR Tech') || false,
        containsGenericNames: response?.includes('[Company Name]') || response?.includes('InnovateTech') || false
      });
      
      // Check workflow progression
      const currentStep = await enhancedWorkflowService.getCurrentStepForThread(this.testThreadId);
      console.log('📍 Updated Current Step:', {
        stepName: currentStep?.name,
        stepType: currentStep?.stepType,
        stepOrder: currentStep?.order,
        metadata: currentStep?.metadata ? Object.keys(currentStep.metadata) : []
      });
      
      // Check for Universal RAG markers
      if (currentStep?.metadata) {
        console.log('🔍 Step Metadata Analysis:', {
          enhancedProcessed: currentStep.metadata.enhancedProcessed,
          universalRAGUsed: currentStep.metadata.universalRAGUsed,
          autoExecutionCompleted: currentStep.metadata.autoExecutionCompleted,
          hasTemplates: !!currentStep.metadata.templates,
          templateKeys: currentStep.metadata.templates ? Object.keys(currentStep.metadata.templates) : []
        });
      }
      
      console.log('✅ Company/industry request completed\n');
      
    } catch (error) {
      console.error('❌ Company/industry request failed:', error);
      throw error;
    }
  }

  private async checkRAGContext() {
    console.log('🔍 Checking RAG Context Availability...');
    
    try {
      // Test RAG context retrieval
      const ragContext = await ragService.getRelevantContext(
        this.testUserId,
        this.testOrgId,
        'asset_generation',
        'press_release',
        'use my company and industry'
      );
      
      console.log('📋 RAG Context Analysis:', {
        hasContext: !!ragContext,
        hasUserDefaults: !!ragContext?.userDefaults,
        companyName: ragContext?.userDefaults?.companyName,
        industry: ragContext?.userDefaults?.industry,
        jobTitle: ragContext?.userDefaults?.jobTitle,
        contextSources: ragContext?.sources?.length || 0
      });
      
      if (ragContext?.userDefaults) {
        console.log('👤 User Profile Found:', {
          company: ragContext.userDefaults.companyName,
          industry: ragContext.userDefaults.industry,
          role: ragContext.userDefaults.jobTitle,
          hasFullName: !!ragContext.userDefaults.fullName
        });
      } else {
        console.log('⚠️ No user profile found in RAG context');
      }
      
    } catch (error) {
      console.error('❌ RAG context check failed:', error);
    }
  }

  private async analyzeResults() {
    console.log('📊 FINAL ANALYSIS\n');
    
    try {
      // Get final workflow state
      const workflow = await enhancedWorkflowService.getWorkflow(this.workflowId);
      if (workflow) {
        console.log('🔄 Final Workflow State:', {
          status: workflow.status,
          currentStepId: workflow.currentStepId?.substring(0, 8),
          totalSteps: workflow.steps?.length || 0
        });
        
        // Analyze each step
        if (workflow.steps) {
          console.log('\n📋 Step Analysis:');
          workflow.steps.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step.name} (${step.stepType}):`, {
              status: step.status,
              hasResponse: !!step.metadata?.response,
              hasTemplates: !!step.metadata?.templates,
              universalRAG: step.metadata?.universalRAGUsed || false
            });
          });
        }
      }
      
      console.log('\n🎯 SUCCESS CRITERIA CHECK:');
      console.log('  ✓ Universal RAG logs should appear in server output');
      console.log('  ✓ System prompt should be 2500+ tokens (not 85)');
      console.log('  ✓ Generated content should contain "Honeyjar"');
      console.log('  ✓ Generated content should contain "PR Tech"');
      console.log('  ✓ Generated content should NOT contain "[Company Name]"');
      console.log('  ✓ Step metadata should show universalRAGUsed: true');
      
    } catch (error) {
      console.error('❌ Final analysis failed:', error);
    }
  }
}

// Run the test
async function main() {
  const test = new UniversalRAGDebugTest();
  await test.runDebugTest();
}

if (require.main === module) {
  main().catch(console.error);
}

export { UniversalRAGDebugTest }; 