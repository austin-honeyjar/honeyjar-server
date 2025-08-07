#!/usr/bin/env tsx

/**
 * Enhanced Workflow Testing Script
 * 
 * Tests all workflow templates and step types to ensure enhanced-workflow.service.ts
 * and context layers are working correctly.
 */

import { EnhancedWorkflowService } from '../src/services/enhanced-workflow.service';
import { ragService } from '../src/services/ragService';
import logger from '../src/utils/logger';

// Test configuration
const TEST_CONFIG = {
  userId: 'test-user-enhanced-workflow',
  orgId: 'test-org-enhanced-workflow',
  testTimeout: 10000, // 10 seconds per test
};

// Workflows to test (enhanced coverage)
const ENHANCED_WORKFLOWS = [
  'Blog Article',
  'Social Post', 
  'Press Release',
  'Media Pitch',
  'FAQ'
];

// Workflows that should delegate to original service
const SECURITY_BLOCKED_WORKFLOWS = [
  'Media List Generator',
  'Media Matching'
];

class EnhancedWorkflowTester {
  private enhancedService: EnhancedWorkflowService;
  private results: any[] = [];

  constructor() {
    this.enhancedService = new EnhancedWorkflowService();
  }

  /**
   * Run comprehensive test suite
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Enhanced Workflow Testing Suite...\n');
    
    try {
      // Test 1: Enhanced Integration
      await this.testEnhancedIntegration();
      
      // Test 2: Context Layer Validation  
      await this.testContextLayers();
      
      // Test 3: Step Type Handling
      await this.testStepTypes();
      
      // Test 4: Dual RAG Integration
      await this.testDualRAGIntegration();
      
      // Test 5: Security & Performance
      await this.testSecurityAndPerformance();
      
      // Test 6: Security Blocked Workflows
      await this.testSecurityBlockedWorkflows();
      
      // Summary Report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  /**
   * Test 1: Enhanced Integration
   */
  async testEnhancedIntegration(): Promise<void> {
    console.log('📋 Test 1: Enhanced Integration\n');
    
    for (const templateName of ENHANCED_WORKFLOWS) {
      try {
        console.log(`  Testing: ${templateName}`);
        
        // Create workflow
        const workflow = await this.enhancedService.createWorkflowWithContext(
          `test-thread-${Date.now()}`,
          this.getTemplateId(templateName),
          TEST_CONFIG.userId,
          TEST_CONFIG.orgId
        );
        
        // Test first step
        const firstStep = workflow.steps.find(s => s.order === 0);
        if (!firstStep) {
          throw new Error(`No first step found in ${templateName}`);
        }
        
        const result = await this.enhancedService.handleStepResponseWithContext(
          firstStep.id,
          `Test input for ${templateName} enhanced processing`,
          TEST_CONFIG.userId,
          TEST_CONFIG.orgId
        );
        
        // Validate enhanced context
        const isEnhanced = !!(result.enhancedContext?.ragContext);
        const hasUserContext = result.response.toLowerCase().includes('company') || 
                              result.response.toLowerCase().includes('context');
        
        this.results.push({
          test: 'Enhanced Integration',
          workflow: templateName,
          stepType: firstStep.stepType,
          stepName: firstStep.name,
          isEnhanced,
          hasUserContext,
          responseLength: result.response.length,
          status: isEnhanced ? 'PASS' : 'FAIL'
        });
        
        console.log(`    ✅ ${templateName}: Enhanced=${isEnhanced}, Context=${hasUserContext}`);
        
      } catch (error) {
        console.log(`    ❌ ${templateName}: ${error.message}`);
        this.results.push({
          test: 'Enhanced Integration',
          workflow: templateName,
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    console.log('');
  }

  /**
   * Test 2: Context Layer Validation
   */
  async testContextLayers(): Promise<void> {
    console.log('🏗️ Test 2: Context Layer Validation\n');
    
    const testWorkflow = 'Blog Article';
    
    try {
      // Create workflow with context
      const workflow = await this.enhancedService.createWorkflowWithContext(
        `test-context-${Date.now()}`,
        this.getTemplateId(testWorkflow),
        TEST_CONFIG.userId,
        TEST_CONFIG.orgId
      );
      
      // Test Asset Generation step (most comprehensive)
      const assetStep = workflow.steps.find(s => s.name === 'Asset Generation');
      if (!assetStep) {
        throw new Error('Asset Generation step not found');
      }
      
      const startTime = Date.now();
      const result = await this.enhancedService.handleStepResponseWithContext(
        assetStep.id,
        'Create comprehensive blog article with all context layers',
        TEST_CONFIG.userId,
        TEST_CONFIG.orgId
      );
      const duration = Date.now() - startTime;
      
      // Validate 5 context layers
      const response = result.response.toLowerCase();
      const layers = {
        userProfile: response.includes('company') || response.includes('user'),
        security: !!(result.enhancedContext?.securityTags),
        workflowExpertise: response.includes('workflow') || response.includes('practice'),
        learning: response.includes('preference') || response.includes('style'),
        performance: duration < 2000
      };
      
      const layerCount = Object.values(layers).filter(Boolean).length;
      
      this.results.push({
        test: 'Context Layers',
        workflow: testWorkflow,
        layers,
        layerCount,
        duration,
        status: layerCount >= 3 ? 'PASS' : 'FAIL'
      });
      
      console.log(`  Context Layers: ${layerCount}/5 detected`);
      console.log(`    User Profile: ${layers.userProfile ? '✅' : '❌'}`);
      console.log(`    Security: ${layers.security ? '✅' : '❌'}`);
      console.log(`    Workflow Expertise: ${layers.workflowExpertise ? '✅' : '❌'}`);
      console.log(`    Learning: ${layers.learning ? '✅' : '❌'}`);
      console.log(`    Performance: ${layers.performance ? '✅' : '❌'} (${duration}ms)`);
      
    } catch (error) {
      console.log(`  ❌ Context Layer Test: ${error.message}`);
      this.results.push({
        test: 'Context Layers',
        status: 'ERROR',
        error: error.message
      });
    }
    
    console.log('');
  }

  /**
   * Test 3: Step Type Handling
   */
  async testStepTypes(): Promise<void> {
    console.log('⚙️ Test 3: Step Type Handling\n');
    
    const stepTypeTests = [
      { workflow: 'Blog Article', stepName: 'Information Collection', expectedType: 'json_dialog' },
      { workflow: 'Blog Article', stepName: 'Asset Generation', expectedType: 'api_call' },
      { workflow: 'Social Post', stepName: 'Information Collection', expectedType: 'json_dialog' },
      { workflow: 'Press Release', stepName: 'Asset Generation', expectedType: 'api_call' }
    ];
    
    for (const test of stepTypeTests) {
      try {
        console.log(`  Testing: ${test.workflow} - ${test.stepName} (${test.expectedType})`);
        
        // Create workflow
        const workflow = await this.enhancedService.createWorkflowWithContext(
          `test-step-${Date.now()}`,
          this.getTemplateId(test.workflow),
          TEST_CONFIG.userId,
          TEST_CONFIG.orgId
        );
        
        // Find target step
        const targetStep = workflow.steps.find(s => s.name === test.stepName);
        if (!targetStep) {
          throw new Error(`Step ${test.stepName} not found`);
        }
        
        // Test step processing
        const testInput = test.expectedType === 'json_dialog' 
          ? 'Test information collection' 
          : 'Generate asset with enhanced context';
          
        const result = await this.enhancedService.handleStepResponseWithContext(
          targetStep.id,
          testInput,
          TEST_CONFIG.userId,
          TEST_CONFIG.orgId
        );
        
        // Validate step type handling
        let isValidResponse = false;
        if (test.expectedType === 'json_dialog') {
          try {
            JSON.parse(result.response);
            isValidResponse = result.response.includes('isComplete') || result.response.includes('collectedInformation');
          } catch {
            isValidResponse = false;
          }
        } else if (test.expectedType === 'api_call') {
          isValidResponse = result.response.length > 200; // Substantial content
        }
        
        this.results.push({
          test: 'Step Type Handling',
          workflow: test.workflow,
          stepName: test.stepName,
          stepType: test.expectedType,
          actualStepType: targetStep.stepType,
          isValidResponse,
          responseLength: result.response.length,
          status: isValidResponse ? 'PASS' : 'FAIL'
        });
        
        console.log(`    ${isValidResponse ? '✅' : '❌'} ${test.stepName}: Valid ${test.expectedType} response`);
        
      } catch (error) {
        console.log(`    ❌ ${test.workflow} - ${test.stepName}: ${error.message}`);
        this.results.push({
          test: 'Step Type Handling',
          workflow: test.workflow,
          stepName: test.stepName,
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    console.log('');
  }

  /**
   * Test 4: Dual RAG Integration
   */
  async testDualRAGIntegration(): Promise<void> {
    console.log('🎯 Test 4: Dual RAG Integration\n');
    
    try {
      // Test dual RAG context directly
      const dualRAGResult = await ragService.getDualRAGContext(
        TEST_CONFIG.userId,
        TEST_CONFIG.orgId,
        'Blog Article',
        'Asset Generation',
        'How do I write an effective blog article?',
        'internal'
      );
      
      const hasGlobalContext = dualRAGResult.globalWorkflowKnowledge.length > 0;
      const hasOrgContext = dualRAGResult.organizationContext.length >= 0; // Org context might be 0
      const hasGoodPerformance = dualRAGResult.performance.totalTime < 1000;
      
      this.results.push({
        test: 'Dual RAG Integration',
        globalSources: dualRAGResult.contextSources.globalSources,
        orgSources: dualRAGResult.contextSources.orgSources,
        totalRelevance: dualRAGResult.contextSources.totalRelevance,
        performance: dualRAGResult.performance,
        hasGlobalContext,
        hasOrgContext,
        hasGoodPerformance,
        status: hasGlobalContext ? 'PASS' : 'WARN'
      });
      
      console.log(`  Global Sources: ${dualRAGResult.contextSources.globalSources}`);
      console.log(`  Org Sources: ${dualRAGResult.contextSources.orgSources}`);
      console.log(`  Total Time: ${dualRAGResult.performance.totalTime}ms`);
      console.log(`  Global Context: ${hasGlobalContext ? '✅' : '⚠️'}`);
      console.log(`  Performance: ${hasGoodPerformance ? '✅' : '⚠️'}`);
      
    } catch (error) {
      console.log(`  ❌ Dual RAG Integration: ${error.message}`);
      this.results.push({
        test: 'Dual RAG Integration',
        status: 'ERROR',
        error: error.message
      });
    }
    
    console.log('');
  }

  /**
   * Test 5: Security & Performance
   */
  async testSecurityAndPerformance(): Promise<void> {
    console.log('🔒 Test 5: Security & Performance\n');
    
    try {
      // Test with PII content
      const workflow = await this.enhancedService.createWorkflowWithContext(
        `test-security-${Date.now()}`,
        this.getTemplateId('Blog Article'),
        TEST_CONFIG.userId,
        TEST_CONFIG.orgId
      );
      
      const firstStep = workflow.steps.find(s => s.order === 0);
      if (!firstStep) {
        throw new Error('No first step found');
      }
      
      const startTime = Date.now();
      const result = await this.enhancedService.handleStepResponseWithContext(
        firstStep.id,
        'Create content about john.doe@company.com and phone 555-123-4567',
        TEST_CONFIG.userId,
        TEST_CONFIG.orgId
      );
      const duration = Date.now() - startTime;
      
      // Security validation
      const hasSecurityTags = !!(result.enhancedContext?.securityTags);
      const emailFiltered = !result.response.includes('john.doe@company.com');
      const phoneFiltered = !result.response.includes('555-123-4567');
      const goodPerformance = duration < 2000;
      
      this.results.push({
        test: 'Security & Performance',
        hasSecurityTags,
        emailFiltered,
        phoneFiltered,
        duration,
        goodPerformance,
        status: (hasSecurityTags && emailFiltered && goodPerformance) ? 'PASS' : 'FAIL'
      });
      
      console.log(`  Security Tags: ${hasSecurityTags ? '✅' : '❌'}`);
      console.log(`  Email Filtered: ${emailFiltered ? '✅' : '❌'}`);
      console.log(`  Phone Filtered: ${phoneFiltered ? '✅' : '❌'}`);
      console.log(`  Performance: ${goodPerformance ? '✅' : '❌'} (${duration}ms)`);
      
    } catch (error) {
      console.log(`  ❌ Security & Performance: ${error.message}`);
      this.results.push({
        test: 'Security & Performance',
        status: 'ERROR',
        error: error.message
      });
    }
    
    console.log('');
  }

  /**
   * Test 6: Security Blocked Workflows
   */
  async testSecurityBlockedWorkflows(): Promise<void> {
    console.log('🚫 Test 6: Security Blocked Workflows\n');
    
    for (const templateName of SECURITY_BLOCKED_WORKFLOWS) {
      try {
        console.log(`  Testing: ${templateName} (should delegate to original service)`);
        
        // These should work but delegate to original service
        const workflow = await this.enhancedService.createWorkflowWithContext(
          `test-blocked-${Date.now()}`,
          this.getTemplateId(templateName),
          TEST_CONFIG.userId,
          TEST_CONFIG.orgId
        );
        
        // Test first step
        const firstStep = workflow.steps.find(s => s.order === 0);
        if (!firstStep) {
          throw new Error(`No first step found in ${templateName}`);
        }
        
        const result = await this.enhancedService.handleStepResponseWithContext(
          firstStep.id,
          'Test security blocked workflow',
          TEST_CONFIG.userId,
          TEST_CONFIG.orgId
        );
        
        // Should work but not have enhanced context (delegates to original)
        const hasEnhancedContext = !!(result.enhancedContext?.ragContext);
        const workflowWorks = !!result.response;
        
        this.results.push({
          test: 'Security Blocked',
          workflow: templateName,
          workflowWorks,
          hasEnhancedContext,
          delegatesToOriginal: !hasEnhancedContext,
          status: workflowWorks ? 'PASS' : 'FAIL'
        });
        
        console.log(`    ${workflowWorks ? '✅' : '❌'} ${templateName}: Works=${workflowWorks}, Enhanced=${hasEnhancedContext}`);
        
      } catch (error) {
        console.log(`    ❌ ${templateName}: ${error.message}`);
        this.results.push({
          test: 'Security Blocked',
          workflow: templateName,
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    console.log('');
  }

  /**
   * Generate comprehensive test report
   */
  generateReport(): void {
    console.log('📊 Enhanced Workflow Test Report\n');
    
    const testGroups = this.groupBy(this.results, 'test');
    
    let totalPassed = 0;
    let totalTests = 0;
    
    for (const [testName, results] of Object.entries(testGroups)) {
      console.log(`${testName}:`);
      
      const passed = results.filter(r => r.status === 'PASS').length;
      const failed = results.filter(r => r.status === 'FAIL').length;
      const errors = results.filter(r => r.status === 'ERROR').length;
      const warnings = results.filter(r => r.status === 'WARN').length;
      
      totalPassed += passed;
      totalTests += results.length;
      
      console.log(`  ✅ Passed: ${passed}`);
      if (failed > 0) console.log(`  ❌ Failed: ${failed}`);
      if (errors > 0) console.log(`  💥 Errors: ${errors}`);
      if (warnings > 0) console.log(`  ⚠️ Warnings: ${warnings}`);
      console.log('');
    }
    
    // Overall summary
    const successRate = (totalPassed / totalTests * 100).toFixed(1);
    console.log(`🎯 Overall Success Rate: ${successRate}% (${totalPassed}/${totalTests})`);
    
    if (totalPassed === totalTests) {
      console.log('🎉 All tests passed! Enhanced workflow system is production-ready!');
    } else {
      console.log('⚠️ Some tests failed. Review issues above before production deployment.');
    }
    
    console.log('\n📄 Detailed results saved to test results array');
  }

  /**
   * Get template ID from template name
   */
  private getTemplateId(templateName: string): string {
    const templateMap: Record<string, string> = {
      'Blog Article': 'blog-article',
      'Social Post': 'social-post',
      'Press Release': 'press-release', 
      'Media Pitch': 'media-pitch',
      'FAQ': 'faq',
      'Media List Generator': 'media-list',
      'Media Matching': 'media-matching'
    };
    
    return templateMap[templateName] || templateName.toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * Group array by property
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const group = (item[key] as unknown as string) || 'unknown';
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }
}

// Main execution
async function main() {
  const tester = new EnhancedWorkflowTester();
  await tester.runAllTests();
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { EnhancedWorkflowTester }; 