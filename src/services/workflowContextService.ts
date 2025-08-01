import { RAGService } from './ragService.js';
import { WORKFLOW_TEMPLATES } from '../templates/workflows/index.js';
import { WorkflowTemplate } from '../types/workflow.js';
import logger from '../utils/logger.js';

/**
 * Service to manage workflow templates as system-wide RAG context
 * Ensures all organizations have access to workflow template knowledge
 */
export class WorkflowContextService {
  private ragService: RAGService;
  private static instance: WorkflowContextService;

  constructor() {
    this.ragService = new RAGService();
  }

  static getInstance(): WorkflowContextService {
    if (!WorkflowContextService.instance) {
      WorkflowContextService.instance = new WorkflowContextService();
    }
    return WorkflowContextService.instance;
  }

  /**
   * Generate comprehensive workflow context document
   */
  private generateWorkflowContextDocument(): string {
    const currentDate = new Date().toISOString().split('T')[0];
    
    let contextDoc = `# HoneyJar Workflow System Context\n\n`;
    contextDoc += `**Generated:** ${currentDate}\n`;
    contextDoc += `**Purpose:** System-wide workflow template knowledge for AI assistance\n\n`;
    
    contextDoc += `## Available Workflows Overview\n\n`;
    contextDoc += `HoneyJar provides ${Object.keys(WORKFLOW_TEMPLATES).length} specialized workflows for content creation and media outreach:\n\n`;
    
    // Add workflow categories
    contextDoc += `### Full Workflow Processes\n`;
    contextDoc += `- **Launch Announcement**: Complete product launch campaigns\n`;
    contextDoc += `- **JSON Dialog PR Workflow**: Interactive PR asset creation\n`;
    contextDoc += `- **Media List Generator**: Database search with dual ranking system\n`;
    contextDoc += `- **Media Matching**: AI-suggested authors with article validation\n\n`;
    
    contextDoc += `### Quick Asset Creation\n`;
    contextDoc += `- **Press Release**: Professional announcement drafts\n`;
    contextDoc += `- **Media Pitch**: Personalized outreach content\n`;
    contextDoc += `- **Social Post**: Brand voice social media content\n`;
    contextDoc += `- **Blog Article**: Long-form thought leadership\n`;
    contextDoc += `- **FAQ**: Comprehensive Q&A documents\n`;
    contextDoc += `- **Quick Press Release**: Streamlined 2-step process\n\n`;
    
    contextDoc += `### Development & Testing\n`;
    contextDoc += `- **Test Step Transitions**: Workflow testing utility\n`;
    contextDoc += `- **Dummy Workflow**: Development and demonstration\n\n`;
    
    // Add detailed workflow information
    contextDoc += `## Detailed Workflow Specifications\n\n`;
    
    Object.entries(WORKFLOW_TEMPLATES).forEach(([name, template]) => {
      contextDoc += this.generateWorkflowSection(name, template);
    });
    
    // Add usage guidelines
    contextDoc += `## Usage Guidelines\n\n`;
    contextDoc += `### Workflow Selection Criteria\n`;
    contextDoc += `- **PR/Announcements**: Use "Press Release" or "Launch Announcement"\n`;
    contextDoc += `- **Media Outreach**: Use "Media Pitch" or "Media Matching"\n`;
    contextDoc += `- **Social Content**: Use "Social Post"\n`;
    contextDoc += `- **Long-form Content**: Use "Blog Article"\n`;
    contextDoc += `- **Quick Turnaround**: Use "Quick Press Release"\n`;
    contextDoc += `- **Complex Campaigns**: Use "Launch Announcement" or "JSON Dialog PR Workflow"\n\n`;
    
    contextDoc += `### Step Types Available\n`;
    contextDoc += `- **AI_SUGGESTION**: AI-generated recommendations\n`;
    contextDoc += `- **USER_INPUT**: User input collection\n`;
    contextDoc += `- **API_CALL**: External service integration\n`;
    contextDoc += `- **DATA_TRANSFORMATION**: Content processing\n`;
    contextDoc += `- **ASSET_CREATION**: Final asset generation\n`;
    contextDoc += `- **JSON_DIALOG**: Interactive conversation collection\n`;
    contextDoc += `- **GENERATE_THREAD_TITLE**: Automatic title generation\n\n`;
    
    contextDoc += `### Security Considerations\n`;
    contextDoc += `- All workflows support security classification (public, internal, confidential, restricted)\n`;
    contextDoc += `- Content is automatically analyzed for PII/PHI detection\n`;
    contextDoc += `- AI-safe content versions are generated for sensitive information\n`;
    contextDoc += `- Workflow context is stored with appropriate security levels\n\n`;
    
    contextDoc += `### Integration Points\n`;
    contextDoc += `- **RAG System**: Context and knowledge retrieval\n`;
    contextDoc += `- **Asset Management**: Generated content storage\n`;
    contextDoc += `- **Security Classification**: Automatic content analysis\n`;
    contextDoc += `- **User Knowledge Base**: Personalized context injection\n\n`;
    
    return contextDoc;
  }

  /**
   * Generate detailed section for a specific workflow
   */
  private generateWorkflowSection(name: string, template: WorkflowTemplate): string {
    let section = `### ${name}\n\n`;
    section += `**Description**: ${template.description}\n\n`;
    
    if (template.steps && template.steps.length > 0) {
      section += `**Steps** (${template.steps.length} total):\n`;
      template.steps.forEach((step, index) => {
        section += `${index + 1}. **${step.name}** (${step.type})\n`;
        section += `   - ${step.description}\n`;
        
        if (step.metadata) {
          if (step.metadata.goal) {
            section += `   - Goal: ${step.metadata.goal}\n`;
          }
          if (step.metadata.options && Array.isArray(step.metadata.options)) {
            section += `   - Options: ${step.metadata.options.slice(0, 3).join(', ')}${step.metadata.options.length > 3 ? '...' : ''}\n`;
          }
          if (step.metadata.autoExecute) {
            section += `   - Auto-executes: Yes\n`;
          }
        }
        
        if (step.dependencies && step.dependencies.length > 0) {
          section += `   - Dependencies: ${step.dependencies.join(', ')}\n`;
        }
        section += `\n`;
      });
    }
    
    section += `---\n\n`;
    return section;
  }

  /**
   * Store workflow context as system RAG document for an organization
   */
  async ensureWorkflowContextForOrg(orgId: string): Promise<void> {
    try {
      logger.info(`Ensuring workflow context for organization: ${orgId}`);
      
      const contextDocument = this.generateWorkflowContextDocument();
      const systemUserId = 'system-workflow-context';
      
      // Store as system RAG document
      await this.ragService.processRagDocument(
        {
          filename: 'workflow-system-context.md',
          fileType: 'text/markdown',
          fileSize: contextDocument.length,
          filePath: '/system/workflow-context',
          title: 'HoneyJar Workflow System Context',
          description: 'Comprehensive workflow template knowledge and usage guidelines',
          contentCategory: 'system-context',
          tags: ['workflow', 'system', 'templates', 'context', 'capabilities']
        },
        contextDocument,
        'admin_global', // Make it globally available
        systemUserId,
        orgId
      );
      
      logger.info(`✅ Workflow context stored for organization ${orgId}`);
    } catch (error) {
      logger.error(`Failed to store workflow context for org ${orgId}:`, error);
      throw error;
    }
  }

  /**
   * Update workflow context for all organizations
   * Call this when workflow templates change
   */
  async updateWorkflowContextGlobally(): Promise<void> {
    try {
      logger.info('🔄 Updating workflow context globally...');
      
      // Since we're using admin_global content source, one update affects all orgs
      const contextDocument = this.generateWorkflowContextDocument();
      const systemUserId = 'system-workflow-context';
      
      // Store as global admin document (accessible to all orgs)
      await this.ragService.processRagDocument(
        {
          filename: 'workflow-system-context.md',
          fileType: 'text/markdown',
          fileSize: contextDocument.length,
          filePath: '/system/workflow-context',
          title: 'HoneyJar Workflow System Context',
          description: 'Comprehensive workflow template knowledge and usage guidelines',
          contentCategory: 'system-context',
          tags: ['workflow', 'system', 'templates', 'context', 'capabilities']
        },
        contextDocument,
        'admin_global', // Globally available to all organizations
        systemUserId,
        undefined // No specific orgId - global content
      );
      
      logger.info('✅ Workflow context updated globally');
    } catch (error) {
      logger.error('Failed to update workflow context globally:', error);
      throw error;
    }
  }

  /**
   * Get workflow context summary for quick reference
   */
  getWorkflowSummary(): string {
    const workflows = Object.keys(WORKFLOW_TEMPLATES);
    return `Available workflows: ${workflows.join(', ')}. Use specific workflow names when users request content creation or media outreach assistance.`;
  }

  /**
   * Check if workflow context exists and is up to date
   */
  async validateWorkflowContext(): Promise<boolean> {
    try {
      // Check if system context exists in RAG
      const ragDocs = await this.ragService.getAvailableRagDocuments('system-workflow-context', 'global');
      const hasWorkflowContext = ragDocs.some(doc => 
        doc.title === 'HoneyJar Workflow System Context' && 
        doc.contentCategory === 'system-context'
      );
      
      if (!hasWorkflowContext) {
        logger.warn('Workflow context not found in RAG system');
        return false;
      }
      
      logger.info('✅ Workflow context validated in RAG system');
      return true;
    } catch (error) {
      logger.error('Error validating workflow context:', error);
      return false;
    }
  }

  /**
   * Initialize workflow context on system startup
   */
  async initializeSystemContext(): Promise<void> {
    try {
      logger.info('🚀 Initializing workflow system context...');
      
      const isValid = await this.validateWorkflowContext();
      
      if (!isValid) {
        logger.info('Workflow context missing or invalid, creating...');
        await this.updateWorkflowContextGlobally();
      }
      
      logger.info('✅ Workflow system context initialization complete');
    } catch (error) {
      logger.error('Failed to initialize workflow system context:', error);
      // Don't throw - this shouldn't block system startup
    }
  }
} 