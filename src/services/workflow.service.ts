import {
  Workflow,
  WorkflowStep,
  WorkflowTemplate,
  StepStatus,
  WorkflowStatus,
  StepType,
} from "../types/workflow";
import {WorkflowDBService} from "./workflowDB.service";
import { OpenAIService } from './openai.service';
import { AssetService } from './asset.service';
import logger from '../utils/logger';
import { BASE_WORKFLOW_TEMPLATE } from '../templates/workflows/base-workflow';
import { DUMMY_WORKFLOW_TEMPLATE } from "../templates/workflows/dummy-workflow";
import { LAUNCH_ANNOUNCEMENT_TEMPLATE } from "../templates/workflows/launch-announcement";
import { JSON_DIALOG_PR_WORKFLOW_TEMPLATE } from "../templates/workflows/json-dialog-pr-workflow";
import { TEST_STEP_TRANSITIONS_TEMPLATE } from "../templates/workflows/test-step-transitions";
import { QUICK_PRESS_RELEASE_TEMPLATE } from "../templates/workflows/quick-press-release";
import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { eq } from "drizzle-orm";
import { JsonDialogService } from './jsonDialog.service';
import { config } from '../config';

// Configuration objects for reuse
const ASSET_TYPES = {
  PRESS_RELEASE: 'Press Release',
  MEDIA_PITCH: 'Media Pitch',
  SOCIAL_POST: 'Social Post',
  BLOG_POST: 'Blog Post',
  FAQ_DOCUMENT: 'FAQ Document',
  EMAIL_ANNOUNCEMENT: 'Email Announcement',
  TALKING_POINTS: 'Talking Points'
};

// Template key mappings - reuse this instead of recreating it multiple times
const TEMPLATE_KEY_MAP: Record<string, string> = {
  'pressrelease': 'pressRelease',
  'mediapitch': 'mediaPitch',
  'socialpost': 'socialPost',
  'blogpost': 'blogPost',
  'faqdocument': 'faqDocument'
};

// Asset recommendations by announcement type
const ASSET_RECOMMENDATIONS: Record<string, string[]> = {
  "Product Launch": [ASSET_TYPES.PRESS_RELEASE, ASSET_TYPES.MEDIA_PITCH, ASSET_TYPES.SOCIAL_POST, ASSET_TYPES.BLOG_POST, ASSET_TYPES.FAQ_DOCUMENT],
  "Funding Round": [ASSET_TYPES.PRESS_RELEASE, ASSET_TYPES.MEDIA_PITCH, ASSET_TYPES.SOCIAL_POST, ASSET_TYPES.TALKING_POINTS],
  "Partnership": [ASSET_TYPES.PRESS_RELEASE, ASSET_TYPES.MEDIA_PITCH, ASSET_TYPES.SOCIAL_POST, ASSET_TYPES.EMAIL_ANNOUNCEMENT],
  "Company Milestone": [ASSET_TYPES.PRESS_RELEASE, ASSET_TYPES.SOCIAL_POST, ASSET_TYPES.BLOG_POST, ASSET_TYPES.EMAIL_ANNOUNCEMENT],
  "Executive Hire": [ASSET_TYPES.PRESS_RELEASE, ASSET_TYPES.MEDIA_PITCH, ASSET_TYPES.SOCIAL_POST, ASSET_TYPES.TALKING_POINTS],
  "Industry Award": [ASSET_TYPES.PRESS_RELEASE, ASSET_TYPES.SOCIAL_POST, ASSET_TYPES.BLOG_POST]
};

// Asset type descriptions
const ASSET_DESCRIPTIONS: Record<string, string> = {
  [ASSET_TYPES.PRESS_RELEASE]: "Official announcement document for media distribution",
  [ASSET_TYPES.MEDIA_PITCH]: "Personalized outreach to journalists/publications",
  [ASSET_TYPES.SOCIAL_POST]: "Content for social media platforms",
  [ASSET_TYPES.BLOG_POST]: "Detailed article for company website/blog",
  [ASSET_TYPES.FAQ_DOCUMENT]: "Anticipated questions and prepared answers",
  [ASSET_TYPES.EMAIL_ANNOUNCEMENT]: "Communication for customers/subscribers",
  [ASSET_TYPES.TALKING_POINTS]: "Key messages for spokespeople"
};

// Information Requirements by asset type
const INFORMATION_REQUIREMENTS: Record<string, string[]> = {
  [ASSET_TYPES.PRESS_RELEASE]: [
    "Company Name",
    "Company Description (what your company does)",
    "Product/Service Name",
    "Product Description",
    "Key Features (3-5 points)",
    "Target Market/Audience",
    "CEO Name and Title (for quote)",
    "Quote from CEO or Executive",
    "Launch/Announcement Date",
    "Pricing Information",
    "Availability Date/Location",
    "Call to Action",
    "PR Contact Name",
    "PR Contact Email/Phone",
    "Company Website"
  ],
  [ASSET_TYPES.MEDIA_PITCH]: [
    "Company Name",
    "Company Description",
    "News/Announcement Summary",
    "Why This Is Newsworthy",
    "Target Media Outlets/Journalists",
    "Spokesperson Name and Title",
    "Key Media Hooks/Angles",
    "Supporting Data/Statistics",
    "Available Resources (interviews, demos, etc.)",
    "Timeline/Embargo Information",
    "PR Contact Information"
  ],
  [ASSET_TYPES.SOCIAL_POST]: [
    "Company Name",
    "Brand Voice/Tone",
    "Announcement Summary",
    "Key Benefit to Highlight",
    "Target Audience",
    "Call to Action",
    "Relevant Hashtags",
    "Link to Include",
    "Platforms (LinkedIn, Twitter, Facebook, Instagram)",
    "Visual Assets Available"
  ],
  [ASSET_TYPES.BLOG_POST]: [
    "Company Name",
    "Announcement Title",
    "Key Message",
    "Target Audience",
    "3-5 Main Points to Cover",
    "Supporting Data/Statistics",
    "Desired Reader Action"
  ],
  [ASSET_TYPES.FAQ_DOCUMENT]: [
    "Company Name",
    "Product/Service Name",
    "Key Information Points",
    "Target Audience",
    "Main Benefit or Value Proposition",
    "Common Questions and Concerns",
    "Technical Details"
  ]
};

// Workflow types for consistent naming
const WORKFLOW_TYPES = {
  DUMMY: 'Dummy Workflow',
  PR_WORKFLOW: 'JSON Dialog PR Workflow',
  LAUNCH_ANNOUNCEMENT: 'Launch Announcement',
  TEST_STEP_TRANSITIONS: 'Test Step Transitions',
  QUICK_PRESS_RELEASE: 'Quick Press Release'
};

// Workflow pattern matching configuration
const WORKFLOW_PATTERNS = {
  [WORKFLOW_TYPES.DUMMY]: [/\b(dummy|test|demo|sample)\b/i],
  [WORKFLOW_TYPES.PR_WORKFLOW]: [/\b(pr|press|release|dialog)\b/i],
  [WORKFLOW_TYPES.LAUNCH_ANNOUNCEMENT]: [/\b(launch|product|announcement|feature)\b/i],
  [WORKFLOW_TYPES.TEST_STEP_TRANSITIONS]: [/\b(step|transition|test step|steps|test transitions)\b/i],
  [WORKFLOW_TYPES.QUICK_PRESS_RELEASE]: [/\b(quick|press release|fast|simple)\b/i]
};

// Add hardcoded UUIDs for each template type
const TEMPLATE_UUIDS = {
  BASE_WORKFLOW: '00000000-0000-0000-0000-000000000001',
  DUMMY_WORKFLOW: '00000000-0000-0000-0000-000000000002',
  LAUNCH_ANNOUNCEMENT: '00000000-0000-0000-0000-000000000003',
  JSON_DIALOG_PR_WORKFLOW: '00000000-0000-0000-0000-000000000004',
  TEST_STEP_TRANSITIONS: '00000000-0000-0000-0000-000000000005',
  QUICK_PRESS_RELEASE: '00000000-0000-0000-0000-000000000006'
};

export class WorkflowService {
  private dbService: WorkflowDBService;
  private openAIService: OpenAIService;
  private assetService: AssetService;
  private jsonDialogService: JsonDialogService;

  constructor() {
    this.dbService = new WorkflowDBService();
    this.openAIService = new OpenAIService();
    this.assetService = new AssetService();
    this.jsonDialogService = new JsonDialogService();
  }

  // Template Management
  async getTemplateByName(name: string): Promise<WorkflowTemplate | null> {
    // Get template directly from code instead of DB
    console.log(`Getting template by name: ${name}`);
    
    // Return the template from code based on name with hardcoded UUID
    switch (name) {
      case BASE_WORKFLOW_TEMPLATE.name:
        return { 
          ...BASE_WORKFLOW_TEMPLATE,
          id: TEMPLATE_UUIDS.BASE_WORKFLOW
        };
      case DUMMY_WORKFLOW_TEMPLATE.name:
        return { 
          ...DUMMY_WORKFLOW_TEMPLATE,
          id: TEMPLATE_UUIDS.DUMMY_WORKFLOW
        };
      case LAUNCH_ANNOUNCEMENT_TEMPLATE.name:
        return { 
          ...LAUNCH_ANNOUNCEMENT_TEMPLATE,
          id: TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT
        };
      case JSON_DIALOG_PR_WORKFLOW_TEMPLATE.name:
        return { 
          ...JSON_DIALOG_PR_WORKFLOW_TEMPLATE,
          id: TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW
        };
      case TEST_STEP_TRANSITIONS_TEMPLATE.name:
        return { 
          ...TEST_STEP_TRANSITIONS_TEMPLATE,
          id: TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS
        };
      case QUICK_PRESS_RELEASE_TEMPLATE.name:
        return { 
          ...QUICK_PRESS_RELEASE_TEMPLATE,
          id: TEMPLATE_UUIDS.QUICK_PRESS_RELEASE
        };
      default:
        console.log(`Template not found for name: ${name}`);
        return null;
    }
  }

  async initializeTemplates(): Promise<void> {
    console.log('Creating minimal template entries in database for foreign key constraints...');
    
    // Create minimal template entries just for foreign key constraints
    // The actual template data comes from code, not the database
    const templateEntries = [
      { id: TEMPLATE_UUIDS.BASE_WORKFLOW, name: 'Base Workflow' },
      { id: TEMPLATE_UUIDS.DUMMY_WORKFLOW, name: 'Dummy Workflow' },
      { id: TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT, name: 'Launch Announcement' },
      { id: TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW, name: 'JSON Dialog PR Workflow' },
      { id: TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS, name: 'Test Step Transitions' },
      { id: TEMPLATE_UUIDS.QUICK_PRESS_RELEASE, name: 'Quick Press Release' }
    ];

    for (const { id, name } of templateEntries) {
      try {
        // Check if template entry already exists
        const existingTemplate = await this.dbService.getTemplate(id);
        
        if (existingTemplate) {
          console.log(`✅ Template entry "${name}" already exists with UUID ${id}`);
          continue;
        }

        // Create minimal template entry (just for foreign key constraint)
        console.log(`Creating minimal template entry "${name}" with UUID ${id}...`);
        await this.dbService.createTemplate({
          id,
          name,
          description: `Template entry for ${name} (actual template data comes from code)`,
          steps: [], // Empty steps since we use code templates
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`✅ Created minimal template entry "${name}" successfully`);
        
      } catch (error) {
        console.error(`❌ Error creating template entry "${name}":`, error);
        // Continue with other templates even if one fails
      }
    }
    
    console.log('Template entry initialization complete. Using in-code templates for actual workflow logic.');
  }

  async getTemplate(templateId: string): Promise<WorkflowTemplate | null> {
    console.log(`Getting template with id: ${templateId}`);
    
    // Check for hardcoded UUIDs first
    if (templateId === TEMPLATE_UUIDS.BASE_WORKFLOW || templateId === "1") {
      return { 
          ...BASE_WORKFLOW_TEMPLATE,
        id: TEMPLATE_UUIDS.BASE_WORKFLOW 
      };
    } else if (templateId === TEMPLATE_UUIDS.DUMMY_WORKFLOW) {
      return { 
        ...DUMMY_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.DUMMY_WORKFLOW 
      };
    } else if (templateId === TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT) {
      return { 
        ...LAUNCH_ANNOUNCEMENT_TEMPLATE, 
        id: TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT 
      };
    } else if (templateId === TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW) {
      return { 
        ...JSON_DIALOG_PR_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW
      };
    } else if (templateId === TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS) {
      return { 
        ...TEST_STEP_TRANSITIONS_TEMPLATE, 
        id: TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS 
      };
    } else if (templateId === TEMPLATE_UUIDS.QUICK_PRESS_RELEASE) {
      return { 
        ...QUICK_PRESS_RELEASE_TEMPLATE, 
        id: TEMPLATE_UUIDS.QUICK_PRESS_RELEASE 
      };
    }
    
    // Check if templateId matches any template name directly
    if (templateId === BASE_WORKFLOW_TEMPLATE.name) {
      return { 
        ...BASE_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.BASE_WORKFLOW 
      };
    } else if (templateId === DUMMY_WORKFLOW_TEMPLATE.name) {
      return { 
        ...DUMMY_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.DUMMY_WORKFLOW 
      };
    } else if (templateId === LAUNCH_ANNOUNCEMENT_TEMPLATE.name) {
      return { 
        ...LAUNCH_ANNOUNCEMENT_TEMPLATE, 
        id: TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT 
      };
    } else if (templateId === JSON_DIALOG_PR_WORKFLOW_TEMPLATE.name) {
      return { 
        ...JSON_DIALOG_PR_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW 
      };
    } else if (templateId === TEST_STEP_TRANSITIONS_TEMPLATE.name) {
      return { 
        ...TEST_STEP_TRANSITIONS_TEMPLATE, 
        id: TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS 
      };
    } else if (templateId === QUICK_PRESS_RELEASE_TEMPLATE.name) {
      return { 
        ...QUICK_PRESS_RELEASE_TEMPLATE, 
        id: TEMPLATE_UUIDS.QUICK_PRESS_RELEASE 
      };
    }
    
    // Fallback to pattern matching in templateId
    if (templateId.includes("Base Workflow")) {
      return { 
        ...BASE_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.BASE_WORKFLOW 
      };
    } else if (templateId.includes("Dummy")) {
      return { 
        ...DUMMY_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.DUMMY_WORKFLOW 
      };
    } else if (templateId.includes("Launch")) {
      return { 
        ...LAUNCH_ANNOUNCEMENT_TEMPLATE, 
        id: TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT 
      };
    } else if (templateId.includes("JSON Dialog PR")) {
      return { 
        ...JSON_DIALOG_PR_WORKFLOW_TEMPLATE, 
        id: TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW 
      };
    } else if (templateId.includes("Test Step")) {
      return { 
        ...TEST_STEP_TRANSITIONS_TEMPLATE, 
        id: TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS 
      };
    } else if (templateId.includes("Quick Press Release")) {
      return { 
        ...QUICK_PRESS_RELEASE_TEMPLATE, 
        id: TEMPLATE_UUIDS.QUICK_PRESS_RELEASE 
      };
    }
    
    // If no match found, try to get the template by name directly
    return this.getTemplateByName(templateId);
  }

  // Workflow Management
  async createWorkflow(threadId: string, templateId: string): Promise<Workflow> {
    console.log(`=== WORKFLOW CREATION DEBUG ===`);
    console.log(`Proceeding to create workflow with templateId: ${templateId} for threadId: ${threadId}`);

    // Add debug logging for template resolution
    console.log(`Attempting to get template with ID: ${templateId}`);

    // Ensure the template exists before creating workflow record
    const template = await this.getTemplate(templateId);
    if (!template) {
      console.error(`❌ TEMPLATE NOT FOUND: Template with ID "${templateId}" was not found`);
      console.log(`Available template IDs in code:`);
      console.log(`- Base Workflow: ${TEMPLATE_UUIDS.BASE_WORKFLOW}`);
      console.log(`- Dummy Workflow: ${TEMPLATE_UUIDS.DUMMY_WORKFLOW}`);
      console.log(`- Launch Announcement: ${TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT}`);
      console.log(`- JSON Dialog PR: ${TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW}`);
      console.log(`- Test Step Transitions: ${TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS}`);
      console.log(`- Quick Press Release: ${TEMPLATE_UUIDS.QUICK_PRESS_RELEASE}`);
      
      throw new Error(`Template not found: ${templateId}`);
    }
    
    console.log(`✅ Template found: "${template.name}" with ${template.steps?.length || 0} steps defined.`);
    console.log(`Template UUID being used: ${template.id}`);

    // Add debug before database workflow creation
    console.log(`Creating workflow record in database with:`);
    console.log(`- threadId: ${threadId}`);
    console.log(`- templateId: ${templateId}`);
    console.log(`- template.id: ${template.id}`);

    // Create the workflow first
    try {
    const workflow = await this.dbService.createWorkflow({
      threadId,
      templateId,
      status: WorkflowStatus.ACTIVE,
      currentStepId: null
    });
      
      console.log(`✅ Created workflow record ${workflow.id}. Now creating steps...`);

    // Create steps and set first step as IN_PROGRESS
    let firstStepId: string | null = null;
    if (template.steps && template.steps.length > 0) {
      // Create all steps first
      for (let i = 0; i < template.steps.length; i++) {
        const stepDefinition = template.steps[i];
        const isFirstStep = i === 0;
        
        // Log the definition being used for this iteration
          console.log(`Creating step ${i} from definition:`, {
            name: stepDefinition.name, 
            type: stepDefinition.type,
            prompt: stepDefinition.prompt?.substring(0, 50) + '...',
            hasMetadata: !!stepDefinition.metadata
          });

        const createdStep = await this.dbService.createStep({
          workflowId: workflow.id,
          stepType: stepDefinition.type,
          name: stepDefinition.name,
          description: stepDefinition.description,
          prompt: stepDefinition.prompt,
          status: isFirstStep ? StepStatus.IN_PROGRESS : StepStatus.PENDING,
          order: i,
          dependencies: stepDefinition.dependencies || [],
          metadata: {
            ...stepDefinition.metadata || {},
            // Mark that the initial prompt has been sent to avoid duplicates
            initialPromptSent: isFirstStep && stepDefinition.prompt ? true : false
          }
        });

          console.log(`✅ Created step ${i}: "${createdStep.name}" (${createdStep.id})`);

        if (isFirstStep && stepDefinition.prompt) {
          firstStepId = createdStep.id;
          // Send the first step's prompt as a message from the AI
            await this.addDirectMessage(threadId, stepDefinition.prompt || "");
            console.log(`✅ Sent first step prompt to thread ${threadId}`);
        }
      }

      if (firstStepId) {
        // Set the workflow's current step to the first step
        await this.dbService.updateWorkflowCurrentStep(workflow.id, firstStepId);
          console.log(`✅ Set currentStepId for workflow ${workflow.id} to ${firstStepId}`);
      }
    }

      console.log(`=== WORKFLOW CREATION COMPLETE ===`);
    // Return the complete workflow
    return this.dbService.getWorkflow(workflow.id) as Promise<Workflow>;
      
    } catch (dbError) {
      console.error(`❌ DATABASE ERROR during workflow creation:`, dbError);
      console.error(`Error details:`, {
        errorMessage: dbError instanceof Error ? dbError.message : 'Unknown error',
        templateId,
        threadId,
        templateName: template.name
      });
      throw dbError;
    }
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    return this.dbService.getWorkflow(id);
  }

  async getWorkflowByThreadId(threadId: string): Promise<Workflow | null> {
    // This function should return the *single* ACTIVE workflow for the thread, if one exists.
    const workflows = await this.dbService.getWorkflowsByThreadId(threadId);
    console.log(`getWorkflowByThreadId: Found ${workflows.length} workflows for thread ${threadId}. Checking for ACTIVE...`);

    const activeWorkflows = workflows.filter((w: Workflow) => w.status === WorkflowStatus.ACTIVE);

    if (activeWorkflows.length === 1) {
      console.log(`getWorkflowByThreadId: Found ACTIVE workflow: ${activeWorkflows[0].id} (Template: ${activeWorkflows[0].templateId})`);
      return activeWorkflows[0];
    } else if (activeWorkflows.length > 1) {
      // This indicates a problem state - log an error and return the newest active one as a fallback
      console.error(`getWorkflowByThreadId: Found MULTIPLE ACTIVE workflows for thread ${threadId}. Returning the most recently created active one.`);
      return activeWorkflows.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())[0];
    } else {
      // No active workflows found
      console.log(`getWorkflowByThreadId: No ACTIVE workflow found for thread ${threadId}. Returning null.`);
      return null; // Let ChatService handle the case where no workflow is active
    }
  }

  async getBaseWorkflowByThreadId(threadId: string): Promise<Workflow | null> {
    const workflows = await this.dbService.getWorkflowsByThreadId(threadId);
    
    // Get the base workflow template UUID
    const baseTemplateId = TEMPLATE_UUIDS.BASE_WORKFLOW;
    
    // Find a workflow that uses the base template UUID
    return workflows.find((w: Workflow) => {
      // Match on the hardcoded UUID
      if (w.templateId === baseTemplateId) {
        return true;
      }
      
      // Legacy matching for backward compatibility
      if (w.templateId.includes("Base Workflow") || w.templateId === BASE_WORKFLOW_TEMPLATE.name) {
        return true;
      }
      
      // Additional logging to help debug template issues
      console.log(`Checking if workflow ${w.id} uses base template. Template ID: ${w.templateId}`);
      return false;
    }) || null;
  }

  async updateThreadTitle(threadId: string, title: string, subtitle: string): Promise<void> {
    const baseWorkflow = await this.getBaseWorkflowByThreadId(threadId);
    if (!baseWorkflow) {
      throw new Error('Base workflow not found');
    }

    const titleStep = baseWorkflow.steps.find(s => s.name === 'Thread Title and Summary');
    if (!titleStep) {
      throw new Error('Title step not found');
    }

    await this.dbService.updateStep(titleStep.id, {
      userInput: title,
      aiSuggestion: subtitle,
      status: StepStatus.COMPLETE
    });
  }

  async updateStep(
    stepId: string,
    data: {
      status?: StepStatus;
      aiSuggestion?: string;
      userInput?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<WorkflowStep> {
    const step = await this.dbService.getStep(stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    return this.dbService.updateStep(stepId, data);
  }

  async rollbackStep(stepId: string): Promise<WorkflowStep> {
    const step = await this.dbService.getStep(stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    return this.dbService.updateStep(stepId, {
      status: StepStatus.PENDING,
    });
  }

  async getNextStep(workflowId: string): Promise<WorkflowStep | null> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Get all pending steps
    const pendingSteps = workflow.steps.filter(
      (step) => step.status === StepStatus.PENDING
    );

    // Find the first step where all dependencies are complete
    const nextStep = pendingSteps.find((step) =>
      step.dependencies.every((depName) => {
        const depStep = workflow.steps.find((s) => s.name === depName);
        return depStep?.status === StepStatus.COMPLETE;
      })
    );

    return nextStep || null;
  }

  async completeWorkflow(workflowId: string): Promise<Workflow> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Check if all steps are complete
    const allStepsComplete = workflow.steps.every(
      (step) => step.status === StepStatus.COMPLETE
    );

    if (!allStepsComplete) {
      throw new Error("Cannot complete workflow: not all steps are complete");
    }

    await this.dbService.updateWorkflowStatus(workflowId, WorkflowStatus.COMPLETED);
    
    // Add a completion message to the thread
    const template = await this.dbService.getTemplate(workflow.templateId);
    if (template && workflow.threadId) {
      await this.addDirectMessage(
        workflow.threadId,
        `🎉 The "${template.name}" workflow has been completed successfully!`
      );
      
      // Add a short delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Start the base workflow again
      await this.restartBaseWorkflow(workflow.threadId);
    }
    
    return this.getWorkflow(workflowId) as Promise<Workflow>;
  }
  
  /**
   * Restart the base workflow after another workflow completes
   */
  private async restartBaseWorkflow(threadId: string): Promise<void> {
    try {
      // Add clear transition message
      await this.addDirectMessage(threadId, "Returning to base workflow...");
      
      // Add a delay to ensure message sequencing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the base workflow template directly from code
      const baseTemplate = BASE_WORKFLOW_TEMPLATE;
      const baseTemplateName = BASE_WORKFLOW_TEMPLATE.name;
      const baseTemplateId = TEMPLATE_UUIDS.BASE_WORKFLOW;
      
      logger.info('Restarting base workflow', { 
        threadId, 
        templateName: baseTemplateName,
        templateId: baseTemplateId
      });
      
      // Get the workflow selection prompt directly from the template
      const basePrompt = (baseTemplate?.steps && baseTemplate.steps.length > 0 && baseTemplate.steps[0]?.prompt) 
        ? baseTemplate.steps[0].prompt 
        : "Which workflow would you like to use?";
      
      // Check if a base workflow already exists for this thread
      const baseWorkflow = await this.getBaseWorkflowByThreadId(threadId);
      
      if (baseWorkflow) {
        // Base workflow exists - activate it and reset it completely
        logger.info('Reactivating existing base workflow', { 
          workflowId: baseWorkflow.id,
          templateId: baseWorkflow.templateId
        });
        
        // IMPORTANT - extract the steps before modifying the workflow status
        const workflowSteps = [...baseWorkflow.steps];
        
        // Set workflow to active
        await this.dbService.updateWorkflowStatus(baseWorkflow.id, WorkflowStatus.ACTIVE);
        
        // Find the first step
        let firstStep = workflowSteps.find(s => s.name === "Workflow Selection");
        if (!firstStep) {
          // Fallback to finding by order
          firstStep = workflowSteps.sort((a, b) => a.order - b.order)[0];
        }
        
        if (firstStep) {
          // Reset first step completely
          await this.dbService.updateStep(firstStep.id, {
            status: StepStatus.IN_PROGRESS,
            userInput: undefined,
            aiSuggestion: undefined,
            metadata: {
              ...firstStep.metadata,
              initialPromptSent: false // Reset this flag
            }
          });
          
          // Set as current step
          await this.dbService.updateWorkflowCurrentStep(baseWorkflow.id, firstStep.id);
          
          // Send the prompt from the template
          await this.addDirectMessage(threadId, basePrompt);
          
          // Now mark the prompt as sent
          await this.dbService.updateStep(firstStep.id, {
            metadata: {
              ...firstStep.metadata,
              initialPromptSent: true
            }
          });
          
          logger.info('Sent base workflow prompt directly from code template', { 
            threadId,
            stepId: firstStep.id 
          });
        } else {
          logger.error('Could not find first step in base workflow');
          
          // Fallback - directly send the prompt from template
          await this.addDirectMessage(threadId, basePrompt);
        }
      } else {
        // Create a new base workflow
        logger.info('Creating new base workflow', { threadId, templateName: baseTemplateName, templateId: baseTemplateId });
        
        try {
          // Create the workflow with the base template using hardcoded UUID
          const newBaseWorkflow = await this.createWorkflow(
            threadId, 
            baseTemplateId // Use the fixed UUID
          );
          
          logger.info('New base workflow created successfully', { 
            workflowId: newBaseWorkflow.id,
            templateId: newBaseWorkflow.templateId,
            currentStepId: newBaseWorkflow.currentStepId
          });
        } catch (createError) {
          logger.error('Error creating base workflow', {
            error: createError instanceof Error ? createError.message : 'Unknown error',
            stack: createError instanceof Error ? createError.stack : undefined
          });
          
          // Try adding prompt directly as fallback
          await this.addDirectMessage(threadId, basePrompt);
        }
      }
    } catch (error) {
      logger.error('Error restarting base workflow', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // As a fallback, use the prompt directly from the code template
      try {
        const basePrompt = BASE_WORKFLOW_TEMPLATE.steps?.[0]?.prompt || 
          "Which workflow would you like to use? Please choose from: Launch Announcement, Dummy Workflow, JSON Dialog PR Workflow, Test Step Transitions, Quick Press Release";
        
        await this.addDirectMessage(threadId, basePrompt);
      } catch (sendError) {
        logger.error('Failed to send fallback prompt', {
          error: sendError instanceof Error ? sendError.message : 'Unknown error'
        });
        
        // Last resort hardcoded fallback only if everything else fails
        await this.addDirectMessage(
          threadId, 
          "Which workflow would you like to use? Please choose from: Launch Announcement, Dummy Workflow, JSON Dialog PR Workflow, Test Step Transitions, Quick Press Release"
        );
      }
    }
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Delete all steps first
    for (const step of workflow.steps) {
      await this.dbService.deleteStep(step.id);
    }

    // Then delete the workflow
    await this.dbService.deleteWorkflow(workflowId);
  }

  /**
   * Process workflow selection with OpenAI to match user input to a valid workflow type
   */
  async processWorkflowSelection(stepId: string, userInput: string): Promise<string> {
    try {
      // Set up logger context
      logger.info('Processing workflow selection', {
        stepId,
        userInputPreview: userInput.substring(0, 50) + (userInput.length > 50 ? '...' : '')
      });

      // Get the step and workflow
      const step = await this.dbService.getStep(stepId);
      if (!step) {
        throw new Error(`Step not found: ${stepId}`);
      }

      const workflow = await this.dbService.getWorkflow(step.workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${step.workflowId}`);
      }
      
      // Handle JSON_DIALOG step type differently
      if (step.stepType === StepType.JSON_DIALOG) {
        // Get conversation history to improve context
        const conversationHistory = await this.getThreadConversationHistory(workflow.threadId, 5);
        
        // Process with JsonDialogService including history
        const jsonDialogResult = await this.jsonDialogService.processMessage(step, userInput, conversationHistory);
        
        logger.info('JSON Dialog processing results', {
          isStepComplete: jsonDialogResult.isStepComplete,
          hasSelectedWorkflow: !!jsonDialogResult.collectedInformation?.selectedWorkflow,
          selectedWorkflow: jsonDialogResult.collectedInformation?.selectedWorkflow || 'None'
        });
        
        // Check if a selection was made
        if (jsonDialogResult.isStepComplete && jsonDialogResult.collectedInformation?.selectedWorkflow) {
          const selectedWorkflow = jsonDialogResult.collectedInformation.selectedWorkflow;
          
          logger.info('Selected workflow from JSON dialog', {
            selectedWorkflow
          });

          // Update the step with the selected workflow type
      await this.dbService.updateStep(stepId, {
            aiSuggestion: selectedWorkflow,
            status: StepStatus.COMPLETE,
            metadata: {
              ...step.metadata,
              collectedInformation: jsonDialogResult.collectedInformation
            }
        });
        
          // Add a direct message with the selection
          await this.addDirectMessage(workflow.threadId, `Selected workflow: ${selectedWorkflow}`);
          
          return selectedWorkflow;
        } else if (jsonDialogResult.nextQuestion) {
          // Need more clarification
          await this.addDirectMessage(workflow.threadId, jsonDialogResult.nextQuestion);
          
          // Don't complete the step yet
        await this.dbService.updateStep(stepId, {
            status: StepStatus.IN_PROGRESS,
            metadata: {
              ...step.metadata,
              collectedInformation: jsonDialogResult.collectedInformation || {}
            }
        });
        
          // Return empty string to indicate no valid selection yet
        return '';
      }
      }
      
      // User input pattern matching as fallback
      const normalizedInput = userInput.toLowerCase().trim();
      let directMatch = '';
      
      // Check for workflow specific keywords using the patterns config
      Object.entries(WORKFLOW_PATTERNS).forEach(([workflowType, patterns]) => {
        if (!directMatch && patterns.some(pattern => pattern.test(normalizedInput))) {
          directMatch = workflowType;
        }
      });
      
      if (directMatch) {
        logger.info('Direct pattern match found for workflow selection', {
          userInput, 
          directMatch
        });
        
        // Update the step with the selected workflow type
        await this.dbService.updateStep(stepId, {
          aiSuggestion: directMatch,
          status: StepStatus.COMPLETE
        });
        
        // Add a direct message with the selection
        await this.addDirectMessage(workflow.threadId, `Selected workflow: ${directMatch}`);
        
        return directMatch;
      }
      
      // Legacy approach - fallback to using OpenAI
      logger.info('No direct match found, using OpenAI to determine workflow selection', { userInput });
      
      await this.addDirectMessage(workflow.threadId, 'Please select a specific workflow type from the available options.');
      
      // Don't complete the step yet, keep collecting input
      await this.dbService.updateStep(stepId, {
        status: StepStatus.IN_PROGRESS
      });
      
      return '';
    } catch (error) {
      logger.error('Error processing workflow selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  /**
   * Process thread title to generate a subtitle
   */
  async processThreadTitle(stepId: string, userInput: string): Promise<string> {
    try {
      const step = await this.dbService.getStep(stepId);
      if (!step) {
        throw new Error(`Step not found: ${stepId}`);
      }

      if (step.name !== "Thread Title and Summary") {
        throw new Error(`Invalid step for thread title processing: ${step.name}`);
      }

      // Get workflow and thread information
      const workflow = await this.dbService.getWorkflow(step.workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found for step: ${stepId}`);
      }

      console.log(`PROCESSING THREAD TITLE: '${userInput}' for thread ${workflow.threadId}`);
      logger.info('Processing thread title', { stepId, userInput, threadId: workflow.threadId });
      
      // Handle differently depending on step type
      let threadTitle = userInput;
      let subtitle = "";
      
      if (step.stepType === StepType.JSON_DIALOG) {
        // For JSON_DIALOG, use the JsonDialogService to process the response
        const jsonDialogResult = await this.jsonDialogService.processMessage(step, userInput);
        
        // Extract title and subtitle from the response
        if (jsonDialogResult.collectedInformation?.threadTitle) {
          threadTitle = jsonDialogResult.collectedInformation.threadTitle;
          subtitle = jsonDialogResult.collectedInformation.subtitle || "";
          
          logger.info('Extracted title and subtitle from JSON response', {
            threadTitle,
            subtitle
          });
        }
      } else {
        // Legacy AI_SUGGESTION approach
      // Add a direct message about processing the title
      await this.addDirectMessage(workflow.threadId, `Processing thread title: "${userInput}"`);
      
      // Use OpenAI to generate a subtitle
      const openAIResult = await this.openAIService.generateStepResponse(step, userInput, []);
      
      // Store OpenAI prompt and response data
      await this.dbService.updateStep(stepId, {
        openAIPrompt: openAIResult.promptData,
        openAIResponse: openAIResult.rawResponse
      });
      
      // Extract subtitle from response (format: "SUBTITLE: [subtitle text]")
        threadTitle = userInput;
        subtitle = openAIResult.responseText;
      if (openAIResult.responseText.includes('SUBTITLE:')) {
        subtitle = openAIResult.responseText.split('SUBTITLE:')[1].trim();
        }
      }
      
      console.log(`FINAL SUBTITLE: '${subtitle}'`);
      
      // Update the step with the title and subtitle
      await this.dbService.updateStep(stepId, {
        aiSuggestion: subtitle,
        userInput: threadTitle
      });
      
      // Add a direct message with the title and subtitle
      await this.addDirectMessage(
        workflow.threadId, 
        `Thread title set to: ${threadTitle}\nGenerated subtitle: ${subtitle}`
      );
      
      // Update the thread title in the database
      await this.updateThreadTitleInDB(workflow.threadId, threadTitle, subtitle);
      
      return subtitle;
    } catch (error) {
      logger.error('Error processing thread title', { error });
      console.error('ERROR PROCESSING TITLE:', error);
      throw error;
    }
  }

  /**
   * Update thread title in the database
   */
  async updateThreadTitleInDB(threadId: string, title: string, subtitle: string): Promise<void> {
    try {
      // Update the thread title in the database
      const [updated] = await db.update(chatThreads)
        .set({ 
          title: title
        })
        .where(eq(chatThreads.id, threadId))
        .returning();
      
      if (updated) {
        console.log(`THREAD TITLE UPDATED: Thread ${threadId} title set to "${title}"`);
        logger.info('Updated thread title in database', { threadId, title });
        
        // Add a system message to notify that the title was updated
        // This will help with frontend refreshing
        await this.addDirectMessage(threadId, `[System] Thread title updated to: ${title}`);
      } else {
        console.error(`Thread title update failed: Thread ${threadId} not found`);
      }
    } catch (error) {
      logger.error('Error updating thread title in database', { threadId, title, error });
      console.error(`Error updating thread title: ${error}`);
      // Don't throw the error as this is not critical to workflow progress
    }
  }

  /**
   * Handle a user's response to a workflow step
   */
  async handleStepResponse(stepId: string, userInput: string): Promise<{
    response: string; // Message indicating step/workflow status
    nextStep?: any;   // Details of the next step, if any
    isComplete: boolean; // Indicates if the *workflow* is now complete
  }> {
    try {
      // 1. Get the current step being processed
      const step = await this.dbService.getStep(stepId);
      if (!step) throw new Error(`Step not found: ${stepId}`);
      const workflowId = step.workflowId;
      
      // Handle JSON_DIALOG step type separately
      if (step.stepType === StepType.JSON_DIALOG) {
        return await this.handleJsonDialogStep(step, userInput);
      }
      
      // Handle API_CALL step type for Quick Press Release Asset Generation
      if (step.stepType === StepType.API_CALL && step.name === "Asset Generation") {
        // Get the workflow to get the threadId
        const workflow = await this.dbService.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        
        // Find the information collection step to get the collected information
        const infoStep = workflow.steps.find(s => s.name === "Information Collection");
        if (!infoStep) throw new Error(`Information Collection step not found`);
        
        // Get collected information from the information step
        const rawCollectedInfo = infoStep.metadata?.collectedInformation || {};
        console.log("API_CALL Asset Generation - Raw collected info:", JSON.stringify(infoStep.metadata, null, 2).substring(0, 1000) + "...");
        
        // Also check for userInput which might contain the information
        console.log("API_CALL Asset Generation - Info step userInput:", infoStep.userInput ? infoStep.userInput.substring(0, 500) + "..." : "No user input");
        
        // Ensure we have some information to work with
        let collectedInfo;
        if (typeof rawCollectedInfo === 'object' && Object.keys(rawCollectedInfo).length > 0) {
          collectedInfo = rawCollectedInfo;
          console.log("API_CALL Asset Generation - Using collectedInformation from metadata");
        } else if (infoStep.userInput) {
          // Fall back to using the user input directly if metadata is empty
          collectedInfo = { manualInput: infoStep.userInput };
          console.log("API_CALL Asset Generation - Using userInput as fallback");
        } else {
          // Last resort, try to use current step's input
          collectedInfo = { manualInput: userInput };
          console.log("API_CALL Asset Generation - Using current step userInput as last resort");
        }
        
        // Send a message about generating the asset
        await this.addDirectMessage(workflow.threadId, `Generating your PR asset. This may take a moment...`);
        
        // Get the template for the appropriate asset type
        let templateName = "pressRelease";
        if (collectedInfo.selectedAssetType) {
          // Try to find the appropriate template based on asset type
          const assetType = collectedInfo.selectedAssetType.toLowerCase().replace(/\s+/g, '');
          
          const templateMap: Record<string, string> = {
            'pressrelease': 'pressRelease',
            'mediapitch': 'mediaPitch',
            'socialpost': 'socialPost',
            'blogpost': 'blogPost',
            'faqdocument': 'faqDocument'
          };
          
          templateName = templateMap[assetType] || 'pressRelease';
        }
        
        const template = step.metadata?.templates?.[templateName];
        if (!template) {
          console.error("Template not found for asset generation", {
            availableTemplates: Object.keys(step.metadata?.templates || {}),
            requestedTemplate: templateName
          });
          throw new Error(`Template not found for asset generation`);
        }
        
        // Create custom step with the template
        const customStep = {
          ...step,
          metadata: {
            ...step.metadata,
            openai_instructions: template
          }
        };
        
        // Format the collected information for generation
        let formattedInfo = "PRESS RELEASE INFORMATION:\n\n";
        
        try {
          // Convert collected information to a formatted string
          if (typeof collectedInfo.manualInput === 'string') {
            // If we're using raw user input, just use it directly with minimal formatting
            formattedInfo = `PRESS RELEASE INFORMATION:\n\n${collectedInfo.manualInput}`;
            console.log("API_CALL Asset Generation - Using manual input directly");
          } else {
            // Otherwise, format structured data
            console.log("API_CALL Asset Generation - Formatting structured information");
            
            if (collectedInfo.companyInfo) {
              formattedInfo += "COMPANY INFORMATION:\n";
              formattedInfo += `Company Name: ${collectedInfo.companyInfo.name || 'Not provided'}\n`;
              formattedInfo += `Company Description: ${collectedInfo.companyInfo.description || 'Not provided'}\n\n`;
            }
            
            if (collectedInfo.announcementDetails) {
              formattedInfo += "ANNOUNCEMENT DETAILS:\n";
              formattedInfo += `Headline/Title: ${collectedInfo.announcementDetails.title || 'Not provided'}\n`;
              formattedInfo += `Main Message: ${collectedInfo.announcementDetails.mainMessage || 'Not provided'}\n\n`;
            }
            
            if (collectedInfo.productInfo) {
              formattedInfo += "PRODUCT INFORMATION:\n";
              formattedInfo += `Product Name: ${collectedInfo.productInfo.name || 'Not provided'}\n`;
              formattedInfo += `Product Description: ${collectedInfo.productInfo.description || 'Not provided'}\n`;
              formattedInfo += `Key Features: ${Array.isArray(collectedInfo.productInfo.keyFeatures) ? 
                collectedInfo.productInfo.keyFeatures.join(', ') : (collectedInfo.productInfo.keyFeatures || 'Not provided')}\n\n`;
            }
            
            if (collectedInfo.executiveInfo) {
              formattedInfo += "EXECUTIVE INFORMATION:\n";
              formattedInfo += `Name: ${collectedInfo.executiveInfo.name || 'Not provided'}\n`;
              formattedInfo += `Title: ${collectedInfo.executiveInfo.title || 'Not provided'}\n`;
              formattedInfo += `Quote: ${collectedInfo.executiveInfo.quote || 'Not provided'}\n\n`;
            }
            
            if (infoStep.userInput) {
              formattedInfo += "USER DIRECT INPUT:\n";
              formattedInfo += infoStep.userInput + "\n\n";
            }
            
            // Add any remaining information as raw JSON
            formattedInfo += "ADDITIONAL INFORMATION:\n";
            formattedInfo += JSON.stringify(collectedInfo, null, 2);
          }
          
          console.log("API_CALL Asset Generation - Formatted info preview:", formattedInfo.substring(0, 500) + "...");
        } catch (formatError) {
          console.error('Error formatting collected information', formatError);
          logger.error('Error formatting collected information', {
            error: formatError instanceof Error ? formatError.message : 'Unknown error'
          });
          
          // Fallback to raw JSON string with user input directly included
          formattedInfo = `All collected information:\n${JSON.stringify(collectedInfo, null, 2)}\n\nDirect User Input:\n${infoStep.userInput || userInput || 'Not provided'}`;
        }
        
        // Generate the asset using OpenAI
        console.log("API_CALL Asset Generation - Sending request to OpenAI");
        const result = await this.openAIService.generateStepResponse(
          customStep,
          formattedInfo,
          []
        );
        
        // Get the generated content directly from the response
        const assetContent = result.responseText;
        const assetType = collectedInfo.selectedAssetType || "Press Release";
        
        // Store the generated asset
        await this.dbService.updateStep(stepId, {
          status: StepStatus.COMPLETE,
          userInput,
          metadata: {
            ...step.metadata,
            generatedAsset: assetContent,
            assetType
          }
        });
        
        // Add the generated asset to the chat
        await this.addDirectMessage(
          workflow.threadId,
          `Here's your generated ${assetType}:\n\n${assetContent}`
        );
        
        // Continue to next step or complete workflow
        if (workflow.templateId.includes("quick-press-release")) {
          // Complete workflow for Quick Press Release
          await this.dbService.updateWorkflowStatus(workflowId, WorkflowStatus.COMPLETED);
          await this.dbService.updateWorkflowCurrentStep(workflow.id, null);
          
          return {
            response: `${assetType} generated successfully.`,
            isComplete: true
          };
        } else {
          // Find the Asset Refinement step for standard workflows
          const refinementStep = workflow.steps.find(s => s.name === "Asset Refinement");
          if (refinementStep) {
            // Mark current step as complete
            await this.dbService.updateStep(stepId, {
              status: StepStatus.COMPLETE
            });
            
            // Set refinement step as current and in progress
            await this.dbService.updateWorkflowCurrentStep(workflow.id, refinementStep.id);
            await this.dbService.updateStep(refinementStep.id, {
              status: StepStatus.IN_PROGRESS,
              metadata: {
                ...refinementStep.metadata,
                initialPromptSent: false,
                generatedAsset: assetContent,
                assetType
              }
            });
            
            // Customize prompt for the specific asset
            const customPrompt = `Here's your generated ${assetType}. Please review it and let me know what specific changes you'd like to make, if any. If you're satisfied, simply let me know.`;
            
            // Send the refinement prompt
            await this.addDirectMessage(workflow.threadId, customPrompt);
            
            // Mark that the prompt has been sent
            await this.dbService.updateStep(refinementStep.id, {
              prompt: customPrompt,
              metadata: {
                ...refinementStep.metadata,
                initialPromptSent: true
              }
            });
            
            return {
              response: `${assetType} generated successfully. Moving to review step.`,
              nextStep: {
                id: refinementStep.id,
                name: refinementStep.name,
                prompt: customPrompt,
                type: refinementStep.stepType
              },
              isComplete: false
            };
          } else {
            // No refinement step, just complete the workflow
            await this.dbService.updateWorkflowStatus(workflowId, WorkflowStatus.COMPLETED);
            await this.dbService.updateWorkflowCurrentStep(workflow.id, null);
            
            return {
              response: `${assetType} generated successfully.`,
              isComplete: true
            };
          }
        }
      }

      // Handle API_CALL step type for automatic Thread Title generation
      if (step.stepType === StepType.API_CALL && step.name === "Thread Title and Summary") {
        // Get the workflow to get the threadId
        const workflow = await this.dbService.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        
        // Find the workflow selection step to get the selected workflow
        const workflowSelectionStep = workflow.steps.find(s => s.name === "Workflow Selection");
        if (!workflowSelectionStep) throw new Error(`Workflow Selection step not found`);
        
        // Get the selected workflow from the step data
        const selectedWorkflow = workflowSelectionStep.aiSuggestion || 
                                workflowSelectionStep.metadata?.collectedInformation?.selectedWorkflow;
        
        if (!selectedWorkflow) {
          throw new Error('No workflow selection found for automatic title generation');
        }
        
        // Generate thread title based on selected workflow and current date
        const currentDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        const threadTitle = `${selectedWorkflow} - ${currentDate}`;
        
        console.log(`AUTO-GENERATING THREAD TITLE: '${threadTitle}' for thread ${workflow.threadId}`);
        logger.info('Auto-generating thread title', { 
          stepId, 
          threadId: workflow.threadId, 
          selectedWorkflow, 
          threadTitle 
        });
        
        // Update the thread title in the database (no user message needed)
        await this.updateThreadTitleInDB(workflow.threadId, threadTitle, "");
        
        // Mark the step as complete
        await this.dbService.updateStep(stepId, {
          status: StepStatus.COMPLETE,
          userInput: "auto-generated",
          aiSuggestion: threadTitle,
          metadata: {
            ...step.metadata,
            autoGenerated: true,
            generatedTitle: threadTitle,
            selectedWorkflow: selectedWorkflow
          }
        });
        
        // Since this is the base workflow and we've completed title generation,
        // we need to transition to the selected workflow
        logger.info('Thread title auto-generated, transitioning to selected workflow', {
          workflowId,
          threadId: workflow.threadId,
          selectedWorkflow
        });
        
        // Mark the base workflow as COMPLETED
        await this.dbService.updateWorkflowStatus(workflowId, WorkflowStatus.COMPLETED);
        await this.dbService.updateWorkflowCurrentStep(workflow.id, null);
        
        // Create the appropriate workflow type
        let newWorkflow: Workflow | null = null;
        
        try {
          if (selectedWorkflow.includes(WORKFLOW_TYPES.LAUNCH_ANNOUNCEMENT)) {
            // Create a Launch Announcement workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT);
          } 
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.PR_WORKFLOW)) {
            // Create a JSON Dialog PR workflow
            newWorkflow = await this.createJsonWorkflow(workflow.threadId);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.TEST_STEP_TRANSITIONS)) {
            // Create a Test Step Transitions workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.DUMMY)) {
            // Create a Dummy workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.DUMMY_WORKFLOW);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.QUICK_PRESS_RELEASE)) {
            // Create a Quick Press Release workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.QUICK_PRESS_RELEASE);
          }
          
          if (newWorkflow) {
            // Don't send a message about starting the workflow - keep it silent
            logger.info('Automatically transitioned to selected workflow', {
              newWorkflowId: newWorkflow.id,
              selectedWorkflow,
              threadTitle
            });
            
            // Return the first step of the new workflow
            if (newWorkflow.currentStepId) {
              const firstStep = newWorkflow.steps.find(s => s.id === newWorkflow!.currentStepId);
              if (firstStep) {
                return {
                  response: ``, // Silent transition
                  nextStep: {
                    id: firstStep.id,
                    name: firstStep.name,
                    prompt: firstStep.prompt,
                    type: firstStep.stepType
                  },
                  isComplete: false
                };
              }
            }
          }
        } catch (error) {
          logger.error('Error creating selected workflow during auto-transition', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            selectedWorkflow,
            threadId: workflow.threadId
          });
          
          // Send error message
          await this.addDirectMessage(
            workflow.threadId,
            `There was an error starting the ${selectedWorkflow} workflow. Please try again.`
          );
          
          return {
            response: `Error starting selected workflow.`,
            isComplete: true
          };
        }
        
        // If we get here, something went wrong
        return {
          response: `Thread titled "${threadTitle}" but failed to start selected workflow.`,
          isComplete: true
        };
      }

      // Handle GENERATE_THREAD_TITLE step type for automatic Thread Title generation
      if (step.stepType === StepType.GENERATE_THREAD_TITLE) {
        // Get the workflow to get the threadId
        const workflow = await this.dbService.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        
        // Find the workflow selection step to get the selected workflow
        const workflowSelectionStep = workflow.steps.find(s => s.name === "Workflow Selection");
        if (!workflowSelectionStep) throw new Error(`Workflow Selection step not found`);
        
        // Get the selected workflow from the step data
        const selectedWorkflow = workflowSelectionStep.aiSuggestion || 
                                workflowSelectionStep.metadata?.collectedInformation?.selectedWorkflow;
        
        if (!selectedWorkflow) {
          throw new Error('No workflow selection found for automatic title generation');
        }
        
        // Generate thread title based on selected workflow and current date
        const currentDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        const threadTitle = `${selectedWorkflow} - ${currentDate}`;
        
        console.log(`AUTO-GENERATING THREAD TITLE: '${threadTitle}' for thread ${workflow.threadId}`);
        logger.info('Auto-generating thread title with GENERATE_THREAD_TITLE step', { 
          stepId, 
          threadId: workflow.threadId, 
          selectedWorkflow, 
          threadTitle 
        });
        
        // Update the thread title in the database silently (no user message needed if silent flag is set)
        if (!step.metadata?.silent) {
          await this.updateThreadTitleInDB(workflow.threadId, threadTitle, "");
        } else {
          // Silent update - just update the DB without any messages
          try {
            const [updated] = await db.update(chatThreads)
              .set({ title: threadTitle })
              .where(eq(chatThreads.id, workflow.threadId))
              .returning();
            
            if (updated) {
              console.log(`SILENT THREAD TITLE UPDATED: Thread ${workflow.threadId} title set to "${threadTitle}"`);
              logger.info('Silently updated thread title in database', { threadId: workflow.threadId, title: threadTitle });
            }
          } catch (error) {
            logger.error('Error silently updating thread title', { threadId: workflow.threadId, title: threadTitle, error });
          }
        }
        
        // Mark the step as complete
        await this.dbService.updateStep(stepId, {
          status: StepStatus.COMPLETE,
          userInput: "auto-generated",
          aiSuggestion: threadTitle,
          metadata: {
            ...step.metadata,
            autoGenerated: true,
            generatedTitle: threadTitle,
            selectedWorkflow: selectedWorkflow
          }
        });
        
        // Since this is the base workflow and we've completed title generation,
        // we need to transition to the selected workflow
        logger.info('Thread title auto-generated, transitioning to selected workflow', {
          workflowId,
          threadId: workflow.threadId,
          selectedWorkflow
        });
        
        // Mark the base workflow as COMPLETED
        await this.dbService.updateWorkflowStatus(workflowId, WorkflowStatus.COMPLETED);
        await this.dbService.updateWorkflowCurrentStep(workflow.id, null);
        
        // Create the appropriate workflow type
        let newWorkflow: Workflow | null = null;
        
        try {
          if (selectedWorkflow.includes(WORKFLOW_TYPES.LAUNCH_ANNOUNCEMENT)) {
            // Create a Launch Announcement workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT);
          } 
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.PR_WORKFLOW)) {
            // Create a JSON Dialog PR workflow
            newWorkflow = await this.createJsonWorkflow(workflow.threadId);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.TEST_STEP_TRANSITIONS)) {
            // Create a Test Step Transitions workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.DUMMY)) {
            // Create a Dummy workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.DUMMY_WORKFLOW);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.QUICK_PRESS_RELEASE)) {
            // Create a Quick Press Release workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(workflow.threadId, TEMPLATE_UUIDS.QUICK_PRESS_RELEASE);
          }
          
          if (newWorkflow) {
            // Don't send a message about starting the workflow - keep it silent
            logger.info('Automatically transitioned to selected workflow', {
              newWorkflowId: newWorkflow.id,
              selectedWorkflow,
              threadTitle
            });
            
            // Return the first step of the new workflow
            if (newWorkflow.currentStepId) {
              const firstStep = newWorkflow.steps.find(s => s.id === newWorkflow!.currentStepId);
              if (firstStep) {
                return {
                  response: ``, // Silent transition
                  nextStep: {
                    id: firstStep.id,
                    name: firstStep.name,
                    prompt: firstStep.prompt,
                    type: firstStep.stepType
                  },
                  isComplete: false
                };
              }
            }
          }
        } catch (error) {
          logger.error('Error creating selected workflow during auto-transition', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            selectedWorkflow,
            threadId: workflow.threadId
          });
          
          // Send error message
          await this.addDirectMessage(
            workflow.threadId,
            `There was an error starting the ${selectedWorkflow} workflow. Please try again.`
          );
          
          return {
            response: `Error starting selected workflow.`,
            isComplete: true
          };
        }
        
        // If we get here, something went wrong
        return {
          response: `Thread titled "${threadTitle}" but failed to start selected workflow.`,
          isComplete: true
        };
      }

      // Process step with OpenAI if needed
      if (step.name === "Workflow Selection") {
        const workflowSelection = await this.processWorkflowSelection(stepId, userInput);
        
        // If empty string returned, it means no valid selection was made
        // Skip the normal step completion process
        if (workflowSelection === '') {
          return {
            response: `Please select a valid workflow type.`,
            isComplete: false
          };
        }
      } else if (step.name === "Thread Title and Summary") {
        await this.processThreadTitle(stepId, userInput);
      } else if (step.name === "Announcement Type Selection") {
        // For Asset Selection step that follows this, we'll need to get the OpenAI recommendations
        // Mark the current step to generate asset recommendations in the next step
        logger.info('Announcement Type selected:', { type: userInput });
        
        // Store the announcement type in the step metadata for later reference
        await this.dbService.updateStep(stepId, {
          metadata: { ...step.metadata, selectedAnnouncementType: userInput }
        });
      } else if (step.stepType === StepType.ASSET_CREATION) {
        // Handle asset creation step type
        logger.info('Processing asset creation step', { stepId, stepName: step.name });
        
        // Get the workflow to get the threadId
        const workflow = await this.dbService.getWorkflow(workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        
        try {
          // Generate and store the asset using our AssetService
          const asset = await this.assetService.generateAssetFromStep(
            workflowId,
            workflow.threadId,
            step,
            "system" // Default user ID for system-generated assets
          );
          
          // Store asset ID in step metadata
          await this.dbService.updateStep(stepId, {
            metadata: { 
              ...step.metadata,
              assetId: asset.id,
              assetCreated: true
            }
          });
          
          // Add a message to the thread about the created asset
          await this.addDirectMessage(
            workflow.threadId,
            `Created ${asset.type}: "${asset.title}"`
          );
          
          logger.info('Asset created successfully', { 
            assetId: asset.id, 
            assetType: asset.type,
            assetTitle: asset.title
          });
        } catch (error) {
          logger.error('Error creating asset', { error });
          // Add error message but allow workflow to continue
          await this.addDirectMessage(
            workflow.threadId,
            `There was an error creating the asset: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else if (step.name === "Asset Review") {
        // Check if this is approval or revision
        const isApproved = 
          userInput.toLowerCase().includes('approved') || 
          userInput.toLowerCase() === 'approve' || 
          userInput.toLowerCase() === 'yes' ||
          userInput.toLowerCase().includes('no more') ||
          userInput.toLowerCase().includes('looks good') ||
          userInput.toLowerCase().includes('this is good');
        
        if (isApproved) {
          // Handle approval - mark step as complete
          await this.dbService.updateStep(stepId, {
            userInput,
            status: StepStatus.COMPLETE,
            metadata: { 
              ...step.metadata,
              approved: true,
              needsRevision: false
            }
          });
          
          console.log(`Asset explicitly approved with: "${userInput}"`);
          
          // Get the workflow to find the Asset Revision step (which we'll skip)
          const workflow = await this.dbService.getWorkflow(workflowId);
          if (workflow) {
            const assetRevisionStep = workflow.steps.find(s => s.name === "Asset Revision");
            if (assetRevisionStep) {
              // Mark Asset Revision as COMPLETE (skipped)
              await this.dbService.updateStep(assetRevisionStep.id, {
                status: StepStatus.COMPLETE,
                userInput: "Asset approved - revision skipped"
              });
              
              // Add message about approval
              await this.addDirectMessage(workflow.threadId, `Asset approved. Proceeding to Post-Asset Tasks.`);
            }
          }
          
          // Normal flow will take it to Post-Asset Tasks
        } else {
          // This is a revision request - mark as in progress
          await this.dbService.updateStep(stepId, {
            userInput,
            status: StepStatus.IN_PROGRESS,
            metadata: { 
              ...step.metadata,
              approved: false,
              needsRevision: true
            }
          });
          
          // Get the workflow to handle revisions
          const workflow = await this.dbService.getWorkflow(workflowId);
          if (workflow) {
            // Get necessary data from previous steps
            const assetGenerationStep = workflow.steps.find(s => s.name === "Asset Generation");
            const infoStep = workflow.steps.find(s => s.name === "Information Collection");
            
            // Determine asset type
            const selectedAsset = step.metadata?.selectedAsset || 
                               assetGenerationStep?.metadata?.selectedAsset || 
                               "Press Release";
            
            // Acknowledge feedback
            await this.addDirectMessage(workflow.threadId, `Thank you for your feedback. I'll update the asset with your requested changes.`);
            
            try {
              // Get right template for the asset type
              const templateKey = selectedAsset.toLowerCase().replace(/\s+/g, '');
              const templateMap: Record<string, string> = {
                'pressrelease': 'pressRelease',
                'mediapitch': 'mediaPitch',
                'socialpost': 'socialPost',
                'blogpost': 'blogPost',
                'faqdocument': 'faqDocument'
              };
              
              const templateName = templateMap[templateKey] || 'pressRelease';
              const template = assetGenerationStep?.metadata?.templates?.[templateName];
              
              if (template) {
                // Message about regenerating
                await this.addDirectMessage(workflow.threadId, `Regenerating your ${selectedAsset} with your requested changes. This may take a moment...`);
                
                // Create custom step for OpenAI
                const customStep = {
                  ...assetGenerationStep,
                  metadata: {
                    ...assetGenerationStep?.metadata,
                    openai_instructions: template
                  }
                };
                
                // Create prompt with feedback
                const revisionPrompt = `${infoStep?.userInput || ""}\n\nPlease make the following changes to the previous version:\n- ${userInput}`;
                
                // Generate revised asset
                const result = await this.openAIService.generateStepResponse(
                  customStep,
                  revisionPrompt,
                  []
                );
                
                // Try to parse the JSON response to extract just the asset content
                let revisedAsset;
                try {
                  const assetData = JSON.parse(result.responseText);
                  if (assetData.asset) {
                    // Successfully parsed JSON with asset field
                    revisedAsset = assetData.asset;
                    logger.info('Successfully extracted revised asset content from JSON response');
                  } else {
                    // JSON parsing worked but no asset field found
                    revisedAsset = result.responseText;
                    logger.warn('JSON parsing succeeded but no asset field found in response');
                  }
                } catch (error) {
                  // JSON parsing failed, use full response
                  revisedAsset = result.responseText;
                  logger.warn('Failed to parse JSON response for revision, using full response', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                  });
                }
                
                // Add message with revised asset
                await this.addDirectMessage(
                  workflow.threadId, 
                  `Here's your revised ${selectedAsset} with the requested changes:\n\n${revisedAsset}`
                );
                
                // Store revised asset
                await this.dbService.updateStep(stepId, {
                  metadata: { 
                    ...step.metadata,
                    revisedAsset: revisedAsset
                  }
                });
                
                // Update prompt for next review
                const revisedPrompt = `Here's your revised ${selectedAsset}. Please review it and let me know what specific changes you'd like to make, if any. If you're satisfied, simply reply with 'approved'.`;
                
                // Update step with new prompt
                await this.dbService.updateStep(stepId, {
                  prompt: revisedPrompt
                });
                
                // Return to the same step for another review
                return {
                  response: `Your ${selectedAsset} has been revised. Please review the changes.`,
                  nextStep: {
                    id: stepId,
                    name: step.name,
                    prompt: revisedPrompt,
                    type: step.stepType
                  },
                  isComplete: false
                };
              }
            } catch (error) {
              logger.error('Error regenerating asset', { error });
              await this.addDirectMessage(workflow.threadId, `There was an error regenerating your ${selectedAsset}. Please try again with different feedback.`);
            }
          }
        }
      }

      // 2. Update the current step: set userInput and mark as COMPLETE
      // Only skip for specific cases where we handled it differently
      const skipCompletingAssetReview = 
        step.name === "Asset Review" && 
        !userInput.toLowerCase().includes('approved') &&
        !userInput.toLowerCase().includes('approve') &&
        !userInput.toLowerCase().includes('looks good') &&
        !userInput.toLowerCase().includes('good') &&
        !userInput.toLowerCase().includes('yes');
        
      if (!skipCompletingAssetReview) {
        await this.dbService.updateStep(stepId, {
          userInput,
          status: StepStatus.COMPLETE
        });
      }

      // 3. Re-fetch the entire workflow to get the most up-to-date state of all steps
      const updatedWorkflow = await this.dbService.getWorkflow(workflowId);
      if (!updatedWorkflow) throw new Error(`Workflow not found after update: ${workflowId}`);

      // 4. Check if this is the base workflow with "Thread Title and Summary" step completed
      const isBaseWorkflow = updatedWorkflow.templateId.includes("base-workflow");
      const hasTitleStep = updatedWorkflow.steps.some(s => s.name === "Thread Title and Summary");
      const isTitleStepComplete = step.name === "Thread Title and Summary" && step.status === StepStatus.COMPLETE;
      
      if (isBaseWorkflow && hasTitleStep && isTitleStepComplete) {
        logger.info('Base workflow thread title step completed, transitioning to selected workflow', {
          workflowId,
          threadId: updatedWorkflow.threadId
        });
        
        // Find the workflow selection step to get the selected workflow type
        const workflowSelectionStep = updatedWorkflow.steps.find(s => s.name === "Workflow Selection");
        if (!workflowSelectionStep) {
          throw new Error('Workflow selection step not found');
        }
        
        // Get the selected workflow type from the step data
        const selectedWorkflow = workflowSelectionStep.aiSuggestion || 
                                workflowSelectionStep.metadata?.collectedInformation?.selectedWorkflow;
        
        if (!selectedWorkflow) {
          throw new Error('No workflow selection found');
        }
        
        // Create a new workflow based on the selected type
        try {
          let newWorkflow: Workflow | null = null;
          
          // Mark the base workflow as COMPLETED
          await this.dbService.updateWorkflowStatus(workflowId, WorkflowStatus.COMPLETED);
          await this.dbService.updateWorkflowCurrentStep(updatedWorkflow.id, null);
          
          logger.info('Creating new workflow based on selection', { selectedWorkflow });
          
          // Create the appropriate workflow type
          if (selectedWorkflow.includes(WORKFLOW_TYPES.LAUNCH_ANNOUNCEMENT)) {
            // Create a Launch Announcement workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(updatedWorkflow.threadId, TEMPLATE_UUIDS.LAUNCH_ANNOUNCEMENT);
          } 
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.PR_WORKFLOW)) {
            // Create a JSON Dialog PR workflow
            newWorkflow = await this.createJsonWorkflow(updatedWorkflow.threadId);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.TEST_STEP_TRANSITIONS)) {
            // Create a Test Step Transitions workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(updatedWorkflow.threadId, TEMPLATE_UUIDS.TEST_STEP_TRANSITIONS);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.DUMMY)) {
            // Create a Dummy workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(updatedWorkflow.threadId, TEMPLATE_UUIDS.DUMMY_WORKFLOW);
          }
          else if (selectedWorkflow.includes(WORKFLOW_TYPES.QUICK_PRESS_RELEASE)) {
            // Create a Quick Press Release workflow using hardcoded UUID
            newWorkflow = await this.createWorkflow(updatedWorkflow.threadId, TEMPLATE_UUIDS.QUICK_PRESS_RELEASE);
          }
          
          if (newWorkflow) {
            // Add a message that we've started the new workflow
            await this.addDirectMessage(
              updatedWorkflow.threadId,
              `Started ${selectedWorkflow} workflow. Let's continue from here.`
            );
            
            // Return the first step of the new workflow
            if (newWorkflow.currentStepId) {
              const firstStep = newWorkflow.steps.find(s => s.id === newWorkflow!.currentStepId);
              if (firstStep) {
                return {
                  response: `Started ${selectedWorkflow} workflow.`,
                  nextStep: {
                    id: firstStep.id,
                    name: firstStep.name,
                    prompt: firstStep.prompt,
                    type: firstStep.stepType
                  },
                  isComplete: false
                };
              }
            }
          }
        } catch (error) {
          logger.error('Error creating selected workflow', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            selectedWorkflow,
            threadId: updatedWorkflow.threadId
          });
          
          // Send error message
          await this.addDirectMessage(
            updatedWorkflow.threadId,
            `There was an error starting the ${selectedWorkflow} workflow. Please try again.`
          );
          
          return {
            response: `Error starting selected workflow.`,
            isComplete: true
          };
        }
      }

      // 5. Find the next pending step whose dependencies are met
      // Sort steps by order to ensure we find the correct next one
      const sortedSteps = updatedWorkflow.steps.sort((a, b) => a.order - b.order);
      const nextStep = sortedSteps.find(s =>
        s.status === StepStatus.PENDING && // Must be pending
        // Dependencies must be met (either no dependencies or all dependency steps are complete)
        (!s.dependencies || s.dependencies.length === 0 ||
          s.dependencies.every(depName => {
            const depStep = updatedWorkflow.steps.find(dep => dep.name === depName);
            return depStep?.status === StepStatus.COMPLETE;
          })
        )
      );

      // 6. If a next step is found
      if (nextStep) {
        // Create nextStepDetails object for returning
        const nextStepDetails = {
          id: nextStep.id,
          name: nextStep.name,
          prompt: nextStep.prompt,
          type: nextStep.stepType
        };
        
        // Update the workflow's current step ID to the next step
        await this.dbService.updateWorkflowCurrentStep(workflowId, nextStep.id);
        
        // Mark the next step as IN_PROGRESS
        await this.dbService.updateStep(nextStep.id, {
          status: StepStatus.IN_PROGRESS
        });

        // Check if this is an API_CALL or GENERATE_THREAD_TITLE step that should auto-execute
        if ((nextStep.stepType === StepType.API_CALL || nextStep.stepType === StepType.GENERATE_THREAD_TITLE) && nextStep.metadata?.autoExecute) {
          logger.info('Auto-executing step', {
            stepId: nextStep.id,
            stepName: nextStep.name,
            stepType: nextStep.stepType,
            workflowId
          });
          
          try {
            // Auto-execute the step
            const autoExecResult = await this.handleStepResponse(nextStep.id, "auto-execute");
            
            // Return the result from auto-execution instead of the normal flow
            return autoExecResult;
          } catch (autoExecError) {
            logger.error('Error auto-executing step', {
              stepId: nextStep.id,
              stepName: nextStep.name,
              stepType: nextStep.stepType,
              error: autoExecError instanceof Error ? autoExecError.message : 'Unknown error'
            });
            
            // Fall back to normal flow if auto-execution fails
            await this.addDirectMessage(updatedWorkflow.threadId, `Error auto-executing step "${nextStep.name}". Please try again.`);
          }
        }

        // Send the step prompt as a message if it has one
        // This ensures every step starts with an AI message
        if (nextStep.prompt && !nextStep.metadata?.initialPromptSent) {
          // Add the step prompt as a direct message
          await this.addDirectMessage(updatedWorkflow.threadId, nextStep.prompt);
          
          // Mark that we've sent the prompt so we don't send duplicates
          await this.dbService.updateStep(nextStep.id, {
            metadata: { ...nextStep.metadata, initialPromptSent: true }
          });
          
          logger.info(`Sent initial prompt for step ${nextStep.name} to thread ${updatedWorkflow.threadId}`);
        }

        return {
          response: `Step "${step.name}" completed. Proceeding to step "${nextStep.name}".`,
          nextStep: nextStepDetails, // Return the logged object
          isComplete: false // Workflow is not complete
        };
      } else {
        // 7. If NO next step is found, the workflow should be complete.
        // Verify that all steps are indeed complete.
        const allStepsNowComplete = updatedWorkflow.steps.every(s => s.status === StepStatus.COMPLETE);

        if (allStepsNowComplete) {
          // Mark the workflow as completed in the database
          await this.dbService.updateWorkflowStatus(workflowId, WorkflowStatus.COMPLETED);
          await this.dbService.updateWorkflowCurrentStep(workflowId, null); // No current step

          console.log(`handleStepResponse: Workflow ${workflowId} completed.`); // Add log
          
          // Check if this is the base workflow
          const template = await this.dbService.getTemplate(updatedWorkflow.templateId);
          if (template && template.name === "Base Workflow") {
            // Add a direct completion message for the base workflow
            await this.addDirectMessage(updatedWorkflow.threadId, "Base workflow completed. Starting selected workflow...");
          }
          
          return {
            response: 'Workflow completed successfully.',
            isComplete: true // Workflow IS complete
          };
        } else {
          // This indicates a potential logic error or inconsistent state
          console.error(`handleStepResponse: Workflow state inconsistency for ${workflowId}: No next step found, but not all steps are complete.`);
          // Potentially return an error state or specific message?
           return {
               response: 'Error: Workflow is in an inconsistent state.',
               isComplete: false // Workflow is not properly complete
           };
        }
      }
    } catch (error) {
      logger.error('Error handling step response:', error);
      // Re-throw the error to be handled by the caller (e.g., ChatService)
      throw error;
    }
  }

  async updateWorkflowCurrentStep(workflowId: string, stepId: string | null): Promise<void> {
    const workflow = await this.dbService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    await this.dbService.updateWorkflowCurrentStep(workflowId, stepId);
  }

  async updateWorkflowStatus(workflowId: string, status: WorkflowStatus): Promise<void> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    await this.dbService.updateWorkflowStatus(workflowId, status);
  }

  /**
   * Add a message directly to the chat thread
   * This is a utility method for adding status updates
   */
  async addDirectMessage(threadId: string, content: string): Promise<void> {
    try {
      // Check if this is a status message that should be prefixed
      let messageContent = content;
      
      // Check if this is an asset message
      const isAssetMessage = content.includes("Here's your generated") || 
                            content.includes("Here's your revised");
      
      // Check if this is a step prompt message (initial step instructions to user)
      const isStepPrompt = !content.startsWith('[') && // Not already prefixed
                          !content.includes("Here's your") && // Not an asset
                          !content.includes("regenerating") && // Not status
                          !content.includes("generating") && // Not status
                          !content.includes("completed"); // Not status
      
      if (isAssetMessage) {
        logger.info(`Adding asset message to thread ${threadId}, content length: ${content.length}`);
      }
      
      if (isStepPrompt) {
        logger.info(`Sending step prompt to thread ${threadId}: "${content.substring(0, 100)}..."`);
      }
      
      // Automatically prefix workflow status messages
      if (content.includes("Step \"") || 
          content.includes("Proceeding to step") || 
          content.includes("completed") || 
          content.startsWith("Processing workflow") ||
          content.startsWith("Selected workflow") ||
          content.startsWith("Workflow selected") ||
          content.startsWith("Announcement type")) {
        messageContent = `[Workflow Status] ${content}`;
      }
      // Add [System] prefix to various system messages
      else if (content.includes("generating") || 
               content.includes("thank you for your feedback") ||
               content.includes("regenerating") ||
               content.includes("revising") ||
               content.includes("creating") ||
               content.includes("this may take a moment") ||
               content.includes("processing")) {
        messageContent = `[System] ${content}`;
      }
      
      // Check for duplicate messages - search for messages with the same content
      // This is especially important for the first step of the Launch Announcement workflow
      const recentMessages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 5, // Check the 5 most recent messages
      });
      
      // Check if this exact message content already exists in the recent messages
      const isDuplicate = recentMessages.some(msg => 
        msg.content === messageContent
      );
      
      // Also check for the first step of Launch Announcement to prevent duplicates
      const isAnnouncementTypeQuestion = 
        content.includes("announcement types") && 
        content.includes("Which type best fits");
        
      const hasAnnouncementTypeQuestion = recentMessages.some(msg => 
        msg.content.includes("announcement types") && 
        msg.content.includes("Which type best fits")
      );
      
      // Skip adding the message if it's a duplicate or if it's the announcement type question and we already have one
      if (isDuplicate || (isAnnouncementTypeQuestion && hasAnnouncementTypeQuestion)) {
        console.log(`Skipping duplicate message: "${messageContent.substring(0, 50)}..."`);
        return;
      }
      
      // Add the message if it's not a duplicate
      await db.insert(chatMessages)
        .values({
          threadId,
          content: messageContent,
          role: "assistant",
          userId: "system"
        });
      
      if (isAssetMessage) {
        logger.info(`Successfully added asset message to thread ${threadId}`);
      } else {
      console.log(`DIRECT MESSAGE ADDED: '${messageContent.substring(0, 50)}...' to thread ${threadId}`);
      }
    } catch (error) {
      logger.error('Error handling JSON message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Handle information collection with JSON responses
   */
  private async handleJsonInformationCollection(
    workflow: Workflow, 
    step: WorkflowStep, 
    userInput: string
  ): Promise<{
    response: string;
    nextStep?: any;
    isComplete: boolean;
    generatedAsset?: string;
    debug?: any;
  }> {
    try {
      // 1. Get the current collected information from step metadata
      const collectedInfo = step.metadata?.collectedInformation || {};
      
      // Store current interaction count and increment for this interaction
      const interactionCount = (step.metadata?.interactionCount || 0) + 1;
      
      // For the first 3 interactions, ALWAYS force more information collection
      // This ensures we never skip straight to asset generation on first few responses
      if (interactionCount <= 3) {
        logger.info('First few interactions - forcing information collection mode', {
          interactionCount,
          userInput: userInput.substring(0, 50)
        });
        
        // For very first interaction, handle announcement type identification
        if (interactionCount === 1) {
          // Store announcement type from first response
          const announcementType = userInput.toLowerCase().includes('product') ? 'Product Launch' : 
                                 userInput.toLowerCase().includes('fund') ? 'Funding Round' :
                                 userInput.toLowerCase().includes('partner') ? 'Partnership' :
                                 userInput.toLowerCase().includes('milestone') ? 'Company Milestone' :
                                 userInput.toLowerCase().includes('hire') || userInput.toLowerCase().includes('executive') ? 'Executive Hire' :
                                 userInput.toLowerCase().includes('award') ? 'Industry Award' : 'Product Launch';
          
          // Update collectedInfo with announcement type
          collectedInfo.announcementType = announcementType;
          
          // Create next question based on announcement type
          let nextQuestion = "";
          if (announcementType === 'Product Launch') {
            nextQuestion = "Great! For your product launch, could you tell me about your company (name, description, industry) and the product you're launching (name, key features, benefits)?";
          } else if (announcementType === 'Funding Round') {
            nextQuestion = "Great! For your funding announcement, could you share details about your company, the funding amount, investors involved, and what round this is (Series A, B, etc.)?";
          } else {
            nextQuestion = "Great! Could you tell me more about your company (name, description, industry) and provide specific details about this announcement?";
          }
          
          // Save metadata
          await this.dbService.updateStep(step.id, {
                  metadata: { 
              ...step.metadata,
              collectedInformation: collectedInfo,
              interactionCount: interactionCount,
              readyForAsset: false
            }
          });
          
          // Add direct message with next question
          await this.addDirectMessage(workflow.threadId, nextQuestion);
          
          // Update step but stay in progress
          await this.dbService.updateStep(step.id, {
            status: StepStatus.IN_PROGRESS,
            userInput: userInput
          });
          
          return {
            response: nextQuestion,
            nextStep: {
              id: step.id,
              name: step.name,
              prompt: nextQuestion,
              type: step.stepType
            },
            isComplete: false
          };
        }
        
        // For second interaction, always ask for spokesperson
        if (interactionCount === 2) {
          // Update with info from second response
          // We'd parse this properly, but for now just continue
          
          // Create next question
          const nextQuestion = "Thank you for that information. Could you tell me who the spokesperson or key executive is for this announcement, their title, and provide a quote from them if available?";
          
          // Save metadata
          await this.dbService.updateStep(step.id, {
                  metadata: {
              ...step.metadata,
              collectedInformation: collectedInfo,
              interactionCount: interactionCount,
              readyForAsset: false
            }
          });
          
          // Add direct message
          await this.addDirectMessage(workflow.threadId, nextQuestion);
          
          // Update step but stay in progress
          await this.dbService.updateStep(step.id, {
            status: StepStatus.IN_PROGRESS,
            userInput: step.userInput ? `${step.userInput}\n${userInput}` : userInput
          });
          
              return {
            response: nextQuestion,
                nextStep: {
              id: step.id,
              name: step.name,
              prompt: nextQuestion,
              type: step.stepType
                },
                isComplete: false
              };
            }
          }
          
      // Normal flow for subsequent interactions
      // 2. Create custom step with proper JSON prompt engineering
      const extractionStep = {
        ...step,
        metadata: {
          ...step.metadata,
          currentInfo: JSON.stringify(collectedInfo, null, 2)
        }
      };
      
      // 3. Call OpenAI to process the user input and get structured JSON response
                const openAIResult = await this.openAIService.generateStepResponse(
        extractionStep,
        userInput,
        []
      );
      
      logger.debug('OpenAI JSON extraction result', {
        response: openAIResult.responseText
      });
      
      // 4. Parse the JSON response
      let extractionData;
      try {
        // Extract the JSON part from the response (should be the entire response)
        extractionData = JSON.parse(openAIResult.responseText);
        
        logger.info('Successfully parsed OpenAI JSON response', {
          readyForAsset: extractionData.readyForAsset,
          missingCount: extractionData.missingInformation ? extractionData.missingInformation.length : 'unknown'
        });
      } catch (parseError) {
        logger.error('Error parsing OpenAI JSON result', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          response: openAIResult.responseText
        });
        
        // Create a default extraction result if parsing fails
        extractionData = {
          extractedInformation: collectedInfo,
          missingInformation: ["company name", "announcement details"],
          readyForAsset: false,
          suggestedAssetType: null,
          nextQuestion: "Could you tell me more about your company and what you're announcing?"
        };
      }
      
      // Additional validation to prevent premature asset generation
      // Check if we have enough core information
      const hasAnnouncementType = !!extractionData.extractedInformation?.announcementType;
      const hasCompanyName = !!(extractionData.extractedInformation?.companyInfo?.name);
      const hasMainMessage = !!(extractionData.extractedInformation?.announcementDetails?.mainMessage);
      
      // Enforce at least 4 interactions and core information before allowing asset generation
      if (interactionCount < 4 || !hasAnnouncementType || !hasCompanyName || !hasMainMessage) {
        logger.info('Enforcing information collection - not ready for asset generation', {
          interactionCount,
          hasAnnouncementType,
          hasCompanyName,
          hasMainMessage,
          originalReadyFlag: extractionData.readyForAsset
        });
        extractionData.readyForAsset = false;
      }
      
      // 5. Save the updated information
      await this.dbService.updateStep(step.id, {
        metadata: {
          ...step.metadata,
          collectedInformation: extractionData.extractedInformation || collectedInfo,
          missingInformation: extractionData.missingInformation || [],
          readyForAsset: extractionData.readyForAsset || false,
          suggestedAssetType: extractionData.suggestedAssetType || null,
          interactionCount: interactionCount
        }
      });
      
      // 6. Determine next action based on the extraction
      if (extractionData.readyForAsset && extractionData.suggestedAssetType) {
        // We have enough information to generate an asset
        // Move to the asset generation step
        const assetGenerationStep = workflow.steps.find(s => s.name === "Asset Generation");
        
        if (assetGenerationStep) {
          // Update the asset generation step with the collected information
          await this.dbService.updateStep(assetGenerationStep.id, {
            status: StepStatus.IN_PROGRESS,
            metadata: {
              ...assetGenerationStep.metadata,
              collectedInformation: extractionData.extractedInformation,
              assetType: extractionData.suggestedAssetType
            }
          });
          
          // Update the current step to complete
          await this.dbService.updateStep(step.id, {
                  status: StepStatus.COMPLETE,
            userInput
          });
          
          // Update workflow to point to the asset generation step
          await this.dbService.updateWorkflowCurrentStep(workflow.id, assetGenerationStep.id);
          
          // Customize the prompt for asset generation
          const customPrompt = `Based on the information collected, I can now generate your ${extractionData.suggestedAssetType}. This may take a moment...`;
          
          // Generate the asset immediately
          return await this.handleJsonAssetGeneration(
            workflow, 
            { ...assetGenerationStep, prompt: customPrompt },
            "generate asset"
          );
        }
      }
      
      // 7. Continue collecting information - ask the next question
      await this.addDirectMessage(workflow.threadId, extractionData.nextQuestion);
      
      // Update the step but keep it in progress
      await this.dbService.updateStep(step.id, {
        status: StepStatus.IN_PROGRESS,
        // Store the user input for context but don't mark as complete
        userInput: step.userInput ? `${step.userInput}\n${userInput}` : userInput
      });
      
              return {
        response: extractionData.nextQuestion,
                nextStep: {
          id: step.id,
          name: step.name,
          prompt: extractionData.nextQuestion,
          type: step.stepType
        },
        isComplete: false,
        debug: config.debug.enableDebugMode ? {
          interactionCount,
          inputLength: userInput.length,
          responseLength: openAIResult.responseText.length,
          readyForAsset: extractionData.readyForAsset,
          ...(config.debug.showFullResponses ? {
            fullResponse: openAIResult.responseText,
            parsedResponse: extractionData
          } : {})
        } : undefined
      };
    } catch (error) {
      logger.error('Error handling JSON information collection', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle asset generation with JSON responses
   */
  private async handleJsonAssetGeneration(
    workflow: Workflow, 
    step: WorkflowStep, 
    userInput: string
  ): Promise<{
    response: string;
    nextStep?: any;
    isComplete: boolean;
    generatedAsset?: string;
    debug?: any;
  }> {
    try {
      logger.info('Starting asset generation', {
        workflowId: workflow.id,
        stepId: step.id,
        userInputPreview: userInput.substring(0, 50) + (userInput.length > 50 ? '...' : '')
      });
      
      // 1. Get the asset type and collected information
      const assetType = step.metadata?.assetType || "Press Release";
      const collectedInfo = step.metadata?.collectedInformation || {};
      
      // Get conversation history to provide context
      const conversationHistory = await this.getThreadConversationHistory(workflow.threadId, 30);
      logger.info(`Using ${conversationHistory.length} conversation history messages for asset generation context`);
      
      // 2. Find the appropriate template for the asset type
      const templateKey = assetType.toLowerCase().replace(/\s+/g, '');
      const templateName = TEMPLATE_KEY_MAP[templateKey] || 'pressRelease';
      const template = step.metadata?.templates?.[templateName];
      
      if (!template) {
        logger.error('Template not found for asset generation', {
          assetType,
          templateKey,
          availableTemplates: Object.keys(step.metadata?.templates || {})
        });
        throw new Error(`Template not found for asset type: ${assetType}`);
      }
      
      // 3. Add a message about generating the asset
      const generationMessage = `Generating your ${assetType}. This may take a moment...`;
      await this.addDirectMessage(workflow.threadId, generationMessage);
      
      // 4. Create a custom step with the template instructions
                const customStep = {
        ...step,
              metadata: { 
          ...step.metadata,
                    openai_instructions: template
                  }
                };
                
      // 5. Format the collected information for asset generation
      const formattedInfo = this.formatJsonInfoForAsset(collectedInfo, assetType, conversationHistory);
      
      logger.info('Sending asset generation request to OpenAI', {
        assetType,
        formattedInfoLength: formattedInfo.length,
        templateLength: template.length
      });
      
      // 6. Generate the asset using OpenAI
                const openAIResult = await this.openAIService.generateStepResponse(
                  customStep,
        formattedInfo,
        []
      );
      
      logger.info('Received asset generation response', {
        responseLength: openAIResult.responseText.length,
        responsePreview: openAIResult.responseText.substring(0, 100) + '...'
      });
      
      // 7. Extract the asset from the JSON response
      let assetContent;
      let parseError = null;
      try {
        const assetData = JSON.parse(openAIResult.responseText);
        assetContent = assetData.asset;
        
        if (!assetContent) {
          throw new Error('Asset content not found in OpenAI response');
        }
      } catch (error) {
        parseError = error;
        logger.error('Error parsing asset JSON', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          response: openAIResult.responseText.substring(0, 200) + '...'
        });
        
        // Fallback to using the entire response if parsing fails
        assetContent = openAIResult.responseText;
      }
      
      // 8. Store the generated asset
      await this.dbService.updateStep(step.id, {
                  metadata: { 
          ...step.metadata,
          generatedAsset: assetContent,
          assetType
        }
      });
      
      // 9. Add the generated asset as a direct message
      await this.addDirectMessage(
        workflow.threadId, 
        `Here's your generated ${assetType}:\n\n${assetContent}`
      );
      
      // 10. Move to the asset revision step
      const assetRevisionStep = workflow.steps.find(s => s.name === "Asset Review" || s.name === "Asset Revision");
                
                if (assetRevisionStep) {
        // Customize the prompt for the asset revision step
        const customPrompt = `Here's your ${assetType}. Please review it and let me know if you'd like to make any changes. If you're satisfied, simply reply with 'approved'.`;
        
        // Update the asset revision step
                  await this.dbService.updateStep(assetRevisionStep.id, {
          status: StepStatus.IN_PROGRESS,
          prompt: customPrompt,
          metadata: {
            ...assetRevisionStep.metadata,
            assetType,
            generatedAsset: assetContent
          }
        });
        
        // Update the current step to complete
        await this.dbService.updateStep(step.id, {
                  status: StepStatus.COMPLETE,
          userInput: userInput || "generate asset"
        });
        
        // Update workflow to point to the asset revision step
        await this.dbService.updateWorkflowCurrentStep(workflow.id, assetRevisionStep.id);
        
        logger.info('Asset generation complete, moving to review step', {
          workflowId: workflow.id,
          currentStepId: step.id,
          nextStepId: assetRevisionStep.id,
          assetType,
          assetContentLength: assetContent.length
        });
        
                return {
          response: customPrompt,
                  nextStep: {
            id: assetRevisionStep.id,
            name: assetRevisionStep.name,
            prompt: customPrompt,
            type: assetRevisionStep.stepType
          },
          isComplete: false,
          generatedAsset: assetContent,
          debug: config.debug.enableDebugMode ? {
            assetType,
            responseLength: openAIResult.responseText.length,
            parseSuccess: !parseError,
            parseError: parseError ? (parseError instanceof Error ? parseError.message : String(parseError)) : null,
            ...(config.debug.showFullResponses ? {
              fullResponse: openAIResult.responseText,
              formattedInfo
            } : {})
          } : undefined
        };
      }
      
      // If no revision step exists (shouldn't happen)
      logger.warn('No asset review step found, completing workflow directly', {
        workflowId: workflow.id,
        availableSteps: workflow.steps.map(s => s.name)
      });
      
              return {
        response: `${assetType} generated successfully.`,
        isComplete: true,
        generatedAsset: assetContent
      };
    } catch (error) {
      logger.error('Error handling JSON asset generation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Handle asset revision with JSON responses
   */
  private async handleJsonAssetRevision(
    workflow: Workflow, 
    step: WorkflowStep, 
    userInput: string
  ): Promise<{
    response: string;
    nextStep?: any;
    isComplete: boolean;
    generatedAsset?: string;
    debug?: any;
  }> {
    try {
      // 1. Get the asset type and original generated asset
      const assetType = step.metadata?.assetType || "Press Release";
      const originalAsset = step.metadata?.generatedAsset || "";
      
      // 2. Create a custom step for revision analysis
      const analysisStep = {
        ...step,
        metadata: {
          ...step.metadata,
          // Make sure the instructions are loaded - use the Asset Review step from JSON Dialog workflow
          openai_instructions: step.metadata?.openai_instructions || 
                              JSON_DIALOG_PR_WORKFLOW_TEMPLATE.steps.find((s) => s.name === "Asset Review")?.metadata?.baseInstructions || ""
        }
      };
      
      // 3. Call OpenAI to analyze the user's feedback in JSON format
      const analysisResult = await this.openAIService.generateStepResponse(
        analysisStep,
        userInput,
        []
      );
      
      // 4. Parse the JSON response
      let revisionData;
      try {
        revisionData = JSON.parse(analysisResult.responseText);
        
        logger.info('Successfully parsed revision JSON', {
          approved: revisionData.approved,
          changeCount: revisionData.changes ? revisionData.changes.length : 0
        });
      } catch (parseError) {
        logger.error('Error parsing revision JSON', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          response: analysisResult.responseText
        });
        
        // Create default revision data if parsing fails
        revisionData = {
          approved: userInput.toLowerCase().includes('approve'),
          changes: [],
          message: "I couldn't understand your feedback clearly. Could you please clarify what changes you'd like to make?"
        };
      }
      
      // 5. Handle approval case
      if (revisionData.approved) {
        // Asset is approved - complete the workflow
        await this.dbService.updateStep(step.id, {
          status: StepStatus.COMPLETE,
          userInput
        });
        
        // Mark the workflow as completed
        await this.dbService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
        await this.dbService.updateWorkflowCurrentStep(workflow.id, null);
        
        // Add a completion message
        await this.addDirectMessage(
          workflow.threadId,
          revisionData.message || `${assetType} approved. Your workflow is now complete.`
        );

        return {
          response: revisionData.message || `${assetType} approved. Your workflow is now complete.`,
          isComplete: true
        };
      }
      
      // 6. Handle revision case - check if changes are specified
      if (revisionData.changes && revisionData.changes.length > 0) {
        // User has requested specific changes
        
        // Add a message about revising the asset
        await this.addDirectMessage(
          workflow.threadId,
          revisionData.message || `Revising your ${assetType} based on your feedback. This may take a moment...`
        );
        
        // Find the asset generation step to get the template
        const assetGenerationStep = workflow.steps.find(s => s.name === "Asset Generation");
        if (!assetGenerationStep) {
          throw new Error('Asset generation step not found');
        }
        
        // Get the appropriate template
        const templateKey = assetType.toLowerCase().replace(/\s+/g, '');
        const templateName = TEMPLATE_KEY_MAP[templateKey] || 'pressRelease';
        const template = assetGenerationStep.metadata?.templates?.[templateName];
        
        if (!template) {
          throw new Error(`Template not found for asset type: ${assetType}`);
        }
        
        // Create revision instructions
        const revisionPrompt = `
        ORIGINAL ASSET:
        ${originalAsset}
        
        REQUESTED CHANGES:
        ${revisionData.changes.map((change: string, index: number) => `${index + 1}. ${change}`).join('\n')}
        
        USER FEEDBACK:
        ${userInput}
        
        TASK:
        Revise the ${assetType} based on the requested changes. Make all requested changes while maintaining the professional quality and structure of the document.
        
        RESPONSE FORMAT:
        Return a JSON object with the revised asset:
        {"asset": "YOUR REVISED ASSET HERE"}`;
        
        // Create a custom step for the revision
        const revisionStep = {
          ...step,
                  metadata: {
            ...step.metadata,
            openai_instructions: revisionPrompt
                  }
                };
                
                // Generate the revised asset
        const revisionResult = await this.openAIService.generateStepResponse(
          revisionStep,
          originalAsset,
          []
        );
        
        // Extract the revised asset from the JSON response
        let revisedAsset;
        try {
          const assetData = JSON.parse(revisionResult.responseText);
          revisedAsset = assetData.asset;
          
          if (!revisedAsset) {
            throw new Error('Revised asset content not found in OpenAI response');
          }
        } catch (parseError) {
          logger.error('Error parsing revised asset JSON', {
            error: parseError instanceof Error ? parseError.message : 'Unknown error',
            response: revisionResult.responseText.substring(0, 200) + '...'
          });
          
          // Fallback to using the entire response if parsing fails
          revisedAsset = revisionResult.responseText;
        }
        
        // Store the revised asset
        await this.dbService.updateStep(step.id, {
          metadata: {
            ...step.metadata,
            revisedAsset: revisedAsset,
            generatedAsset: revisedAsset, // Replace original with revised
            revisionFeedback: userInput,
            revisionChanges: revisionData.changes
          }
        });
                
                // Add the revised asset as a direct message
                await this.addDirectMessage(
          workflow.threadId,
          `Here's your revised ${assetType}:\n\n${revisedAsset}`
        );
        
        // Update the step prompt for another review
        const revisedPrompt = `Here's your revised ${assetType}. Please review it and let me know if you'd like to make any additional changes. If you're satisfied, simply reply with 'approved'.`;
        
        await this.dbService.updateStep(step.id, {
          prompt: revisedPrompt,
          // Don't change status - keep at IN_PROGRESS for another review
        });
          
          return {
          response: revisedPrompt,
          nextStep: {
            id: step.id,
            name: step.name,
            prompt: revisedPrompt,
            type: step.stepType
          },
          isComplete: false,
          generatedAsset: revisedAsset
          };
        } else {
        // No specific changes requested - ask for clarification
        await this.addDirectMessage(
          workflow.threadId,
          revisionData.message || "Could you please specify what changes you'd like me to make to the asset?"
        );
        
           return {
          response: revisionData.message || "Could you please specify what changes you'd like me to make to the asset?",
          nextStep: {
            id: step.id,
            name: step.name,
            prompt: step.prompt,
            type: step.stepType
          },
          isComplete: false
        };
      }
    } catch (error) {
      logger.error('Error handling JSON asset revision', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Format collected information for asset generation in a structured way
   */
  private formatJsonInfoForAsset(collectedInfo: any, assetType: string, conversationHistory: string[] = []): string {
    // Create a structured prompt from the collected information
    let prompt = `GENERATE A ${assetType.toUpperCase()}\n\n`;
    
    // Add the full JSON structure for consistent formatting
    prompt += `COLLECTED INFORMATION:\n${JSON.stringify(collectedInfo, null, 2)}\n\n`;
    
    // Add conversation history context if available
    if (conversationHistory && conversationHistory.length > 0) {
      // Format the conversation history to make it more useful
      const formattedHistory = conversationHistory.map((msg, i) => 
        `${i % 2 === 0 ? 'User' : 'Assistant'}: ${msg}`
      ).join('\n');
      
      prompt += `CONVERSATION HISTORY FOR CONTEXT:\n${formattedHistory}\n\n`;
    }
    
    // Add additional instruction for proper output format
    prompt += `RESPONSE FORMAT:\nReturn a JSON object with the asset content as specified in the instructions. The response MUST be valid JSON with an "asset" field containing the generated content.\n`;
    prompt += `Example: {"asset": "Your generated content here..."}\n\n`;
    
    // Add emphasis on using all available information
    prompt += `IMPORTANT: Use ALL relevant information from both the collected information and conversation history to create the most complete and accurate ${assetType} possible.\n`;
    
    return prompt;
  }

  /**
   * Handle a JSON Dialog step
   */
  private async handleJsonDialogStep(step: WorkflowStep, userInput: string): Promise<{
    response: string;
    nextStep?: any;
    isComplete: boolean;
  }> {
    try {
      logger.info('Handling JSON dialog step', {
        stepId: step.id,
        stepName: step.name
      });

      const workflow = await this.dbService.getWorkflow(step.workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${step.workflowId}`);
      }

      // Special handling for "Generate an Asset" step in Quick Press Release workflow
      if (step.name === "Generate an Asset") {
        // Remove custom logic - use the standard JSON dialog processing instead
        logger.info('Using standard JSON dialog processing for Generate an Asset step');
      }

      // If this is the first time processing this step and no initialPromptSent flag is set
      // Send the prompt to the user
      if (step.prompt && !step.metadata?.initialPromptSent) {
        await this.addDirectMessage(workflow.threadId, step.prompt);
        
        // Mark that we've sent the prompt
        await this.dbService.updateStep(step.id, {
          metadata: { ...step.metadata, initialPromptSent: true }
        });
        
        logger.info(`Sent initial prompt for JSON step ${step.name} in handleJsonDialogStep`);
      }

      // Fetch conversation history for the thread
      const conversationHistory = await this.getThreadConversationHistory(workflow.threadId, 25);
      
      logger.info('Retrieved conversation history', {
        threadId: workflow.threadId,
        messageCount: conversationHistory.length
      });

      // Process the message with the JsonDialogService, including conversation history
      const result = await this.jsonDialogService.processMessage(step, userInput, conversationHistory);
      
      logger.info('JSON dialog processed', {
        isStepComplete: result.isStepComplete,
        suggestedNextStep: result.suggestedNextStep || 'None',
        readyToGenerate: result.readyToGenerate || false
      });

      // Check if the user is confirming they want to generate an asset
      const isGenerationConfirmation = userInput.toLowerCase().match(/\b(yes|generate|proceed|go ahead|create|ready|ok|sure)\b/) && 
                                     step.metadata?.askedAboutGeneration;
                                     
      // Check if this is an information collection step and the user has confirmed generation
      if (!result.isStepComplete && result.readyToGenerate && isGenerationConfirmation) {
        logger.info('User confirmed asset generation with partial information', {
          stepId: step.id,
          workflowId: workflow.id
        });
        
        // Mark the step as complete despite missing some information
        result.isStepComplete = true;
        
        // Update log to reflect the change
        logger.info('Step forcefully marked complete based on user confirmation', {
          stepId: step.id
        });
      }

      // Store the user input and any collected information
      await this.dbService.updateStep(step.id, {
        // Update status based on completion
        status: result.isStepComplete ? StepStatus.COMPLETE : StepStatus.IN_PROGRESS,
        userInput: userInput,
        metadata: {
          ...step.metadata,
          collectedInformation: result.collectedInformation,
          // Track if we've asked about generation to handle user confirmation
          askedAboutGeneration: result.readyToGenerate || step.metadata?.askedAboutGeneration
        }
      });

      // Special case for Test Step Transitions workflow, Step 4
      // Handle completion directly for the final step
      const template = await this.dbService.getTemplate(workflow.templateId);
      const isTestWorkflow = template && template.name === WORKFLOW_TYPES.TEST_STEP_TRANSITIONS;
      const isFinalStep = step.name === "Step 4";
      const isCorrectInput = userInput.trim() === "4";
      
      if (isTestWorkflow && isFinalStep && isCorrectInput && result.isStepComplete) {
        logger.info('Test workflow final step completed, directly completing workflow', {
          workflowId: workflow.id,
          threadId: workflow.threadId
        });
        
        // Mark the workflow as completed
        await this.dbService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
        await this.dbService.updateWorkflowCurrentStep(workflow.id, null);
        
        // Build a clear completion message
        const completionMessage = "🎉 WORKFLOW COMPLETED: All 4 test steps completed successfully!";
        const summaryMessage = "Final sum of all inputs: 10 (1+2+3+4)";
        
        // Send the completion messages first to ensure they're displayed
        await this.addDirectMessage(workflow.threadId, completionMessage);
        await this.addDirectMessage(workflow.threadId, summaryMessage);
        
        // Important: Add a larger delay to ensure messages are processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Now handle transition to base workflow
        await this.restartBaseWorkflow(workflow.threadId);
        
        // Return result to indicate workflow is complete
                  return {
          response: completionMessage,
          isComplete: true
        };
      }

      // If the step is complete, move to the next step
      if (result.isStepComplete) {
        logger.info('Step is complete - moving to next step', {
          currentStep: step.name,
          suggestedNextStep: result.suggestedNextStep
        });
        
        // Handle special case for Workflow Selection - save selected workflow
        if (step.name === "Workflow Selection" && result.collectedInformation?.selectedWorkflow) {
          await this.dbService.updateStep(step.id, {
            aiSuggestion: result.collectedInformation.selectedWorkflow
          });
        }
        
        // Handle special case for Asset Type Selection - extract from either format
        else if (step.name === "Asset Type Selection") {
          // Try both formats - extractedInformation (new) or collectedInformation (legacy)
          const selectedAssetType = result.collectedInformation?.selectedAssetType || 
                                  result.collectedInformation?.extractedInformation?.selectedAssetType;
          
          if (selectedAssetType) {
            logger.info('Selected asset type from JSON dialog', {
              selectedAssetType
            });
            
            await this.dbService.updateStep(step.id, {
              aiSuggestion: selectedAssetType,
              metadata: {
                ...step.metadata,
                selectedAssetType: selectedAssetType
              }
            });
          }
        }
        
        // Find the next step - either suggested or next in order
        let nextStep;
        
        // If a specific next step is suggested, use that
        if (result.suggestedNextStep) {
          nextStep = workflow.steps.find(s => s.name === result.suggestedNextStep);
        }
        
        // If no suggested step or not found, find the next step in order
        if (!nextStep) {
          // Get the next step in order
          const steps = workflow.steps.sort((a, b) => a.order - b.order);
          const currentIndex = steps.findIndex(s => s.id === step.id);
          nextStep = steps[currentIndex + 1];
        }
        
        // If a next step is found, update it and the workflow
        if (nextStep) {
          // Update the workflow to point to the next step
          await this.dbService.updateWorkflowCurrentStep(workflow.id, nextStep.id);
          
          // Mark the next step as IN_PROGRESS
          await this.dbService.updateStep(nextStep.id, {
            status: StepStatus.IN_PROGRESS,
            // Reset initialPromptSent to ensure first message shows
            metadata: { ...nextStep.metadata, initialPromptSent: false }
          });
          
          // Check if the next step is an API_CALL that should auto-execute
          if (nextStep.stepType === StepType.API_CALL && nextStep.name === "Asset Generation") {
            logger.info('Auto-executing Asset Generation step', {
              stepId: nextStep.id,
              workflowId: workflow.id
            });
            
            // Automatically execute the Asset Generation step
            try {
              const assetResult = await this.handleJsonAssetGeneration(workflow, nextStep, "auto-execute");
              
              // Return the result from asset generation
              return assetResult;
            } catch (error) {
              logger.error('Error auto-executing Asset Generation step', {
                error: error instanceof Error ? error.message : 'Unknown error'
              });
              
              // Fall back to normal step processing if auto-execution fails
              await this.addDirectMessage(workflow.threadId, "There was an error generating your asset. Please try again.");
              
              return {
                response: "Error generating asset. Please try again.",
                nextStep: {
                  id: nextStep.id,
                  name: nextStep.name,
                  prompt: nextStep.prompt,
                  type: nextStep.stepType
                },
                isComplete: false
              };
            }
          }
          
          // Send the initial prompt for the next step (for non-auto-executing steps)
          if (nextStep.prompt) {
            await this.addDirectMessage(workflow.threadId, nextStep.prompt);
            
            // Mark prompt as sent
        await this.dbService.updateStep(nextStep.id, {
              metadata: { ...nextStep.metadata, initialPromptSent: true }
            });
            
            logger.info(`Sent initial prompt for next step ${nextStep.name}`);
          }
          
          // Add a transition message
          const transitionMessage = result.nextQuestion || 
                                  `Step "${step.name}" completed. Moving to "${nextStep.name}".`;
          await this.addDirectMessage(workflow.threadId, transitionMessage);

        return {
            response: transitionMessage,
            nextStep: {
              id: nextStep.id,
              name: nextStep.name,
              prompt: nextStep.prompt,
              type: nextStep.stepType
            },
            isComplete: false
        };
      } else {
          // No next step found - workflow is complete
          await this.dbService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
          await this.dbService.updateWorkflowCurrentStep(workflow.id, null);
          
          // Use the nextQuestion from the result if available, otherwise use a generic completion message
          const completionMessage = result.nextQuestion || 
                                  `🎉 Workflow "${workflow.templateId}" completed successfully! All steps are now complete.`;
          
          // Send the completion message to the user
          await this.addDirectMessage(workflow.threadId, completionMessage);
          
          // If we have a completion message from the last step, use it; otherwise use generic
          return {
            response: completionMessage,
            isComplete: true
          };
        }
      } else {
        // Step is not complete, but check if we're ready to generate
        if (result.readyToGenerate && !step.metadata?.askedAboutGeneration) {
          // Format a message that both asks if they want to proceed AND tells them what's missing
          let generationMessage = result.nextQuestion || "I have enough information to generate your asset. Would you like to proceed?";
          
          // If message doesn't already mention missing fields, add them
          if (!generationMessage.includes("missing") && result.collectedInformation?.missingFields) {
            const missingFields = Array.isArray(result.collectedInformation.missingFields) 
              ? result.collectedInformation.missingFields.join(", ")
              : "additional details";
            
            generationMessage += `\n\nAdding ${missingFields} would make your asset more effective, but we can proceed with what we have.`;
          }
          
          await this.addDirectMessage(workflow.threadId, generationMessage);
          
          return {
            response: generationMessage,
            nextStep: {
              id: step.id,
              name: step.name,
              prompt: generationMessage,
              type: step.stepType
            },
            isComplete: false
          };
        }

        // Standard case - step not complete and not ready to generate
        const nextQuestion = result.nextQuestion || "Please provide more information.";
        await this.addDirectMessage(workflow.threadId, nextQuestion);
        
           return {
          response: nextQuestion,
          nextStep: {
            id: step.id,
            name: step.name,
            prompt: nextQuestion,
            type: step.stepType
          },
          isComplete: false
        };
      }
    } catch (error) {
      logger.error('Error handling JSON dialog step', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  /**
   * Get recent conversation history from a thread
   */
  private async getThreadConversationHistory(threadId: string, limit: number = 50): Promise<string[]> {
    try {
      // Get recent messages from the thread
      const messages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: limit * 2, // Fetch more to allow filtering and sorting
      });

      logger.info(`Retrieved ${messages.length} raw messages for thread ${threadId}`);

      // Sort them chronologically
      const sortedMessages = [...messages].sort((a, b) => 
        new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());
      
      // Filter out system messages and extract just the content
      const conversationHistory = sortedMessages
        .filter(msg => !msg.content.startsWith('[System]') && !msg.content.startsWith('[Workflow Status]'))
        .slice(-limit * 2) // Keep only most recent messages after filtering
        .map(msg => msg.content);
      
      logger.info(`Processed ${conversationHistory.length} conversation history messages for thread ${threadId}`);
      
      return conversationHistory;
    } catch (error) {
      logger.error('Error getting conversation history', {
          threadId,
        error: error instanceof Error ? error.message : 'Unknown error'
        });
      return [];
    }
  }

  // Helper method to get recommended assets for an announcement type
  private getAssetSelectionPrompt(announcementType: string): string {
    // Find the matching announcement type (case-insensitive)
    const normalizedType = Object.keys(ASSET_RECOMMENDATIONS).find(
      type => type.toLowerCase().includes(announcementType.toLowerCase()) ||
             announcementType.toLowerCase().includes(type.toLowerCase())
    ) || "Product Launch";
    
    // Get the appropriate assets
    const assets = ASSET_RECOMMENDATIONS[normalizedType];
    
    // Build the prompt
    let prompt = `Based on your ${normalizedType.toLowerCase()} announcement, we recommend the following assets:\n\n`;
    
    // Add each asset with its description
    assets.forEach(asset => {
      prompt += `- ${asset}: ${ASSET_DESCRIPTIONS[asset] || ""}\n`;
    });
    
    prompt += `\nWhich of these would you like to generate?`;
    
    return prompt;
  }

  // Add directly after createWorkflow method
  async createJsonWorkflow(threadId: string): Promise<Workflow> {
    console.log(`Creating JSON Dialog PR workflow for threadId: ${threadId}`);

    // Get the template by name
    const template = await this.getTemplateByName(JSON_DIALOG_PR_WORKFLOW_TEMPLATE.name);
    
    if (!template) {
      throw new Error(`${WORKFLOW_TYPES.PR_WORKFLOW} template not found`);
    }
    console.log(`Using template "${template.name}" with ${template.steps?.length || 0} steps defined.`);

    // Create the workflow with the fixed UUID
    const workflow = await this.dbService.createWorkflow({
      threadId,
      templateId: TEMPLATE_UUIDS.JSON_DIALOG_PR_WORKFLOW,
      status: WorkflowStatus.ACTIVE,
      currentStepId: null
    });
    console.log(`Created workflow record ${workflow.id}. Now creating steps...`);

    // Create steps and set first step as IN_PROGRESS
    let firstStepId: string | null = null;
    if (template.steps && template.steps.length > 0) {
      // Create all steps first
      for (let i = 0; i < template.steps.length; i++) {
        const stepDefinition = template.steps[i];
        const isFirstStep = i === 0;
        
        console.log(`Creating step ${i}: ${stepDefinition.name}`);

        const createdStep = await this.dbService.createStep({
          workflowId: workflow.id,
          stepType: stepDefinition.type,
          name: stepDefinition.name,
          description: stepDefinition.description,
          prompt: stepDefinition.prompt,
          status: isFirstStep ? StepStatus.IN_PROGRESS : StepStatus.PENDING,
          order: i,
          dependencies: stepDefinition.dependencies || [],
          metadata: {
            ...stepDefinition.metadata || {},
            // Initialize the information tracking for the first step
            collectedInformation: isFirstStep ? {} : undefined,
            initialPromptSent: isFirstStep && stepDefinition.prompt ? true : false
          }
        });

        if (isFirstStep) {
          firstStepId = createdStep.id;
          // Send the first step's prompt as a message from the AI
          await this.addDirectMessage(threadId, stepDefinition.prompt || "");
          console.log(`Sent first step prompt to thread ${threadId}`);
        }
      }

      if (firstStepId) {
        // Set the workflow's current step to the first step
        await this.dbService.updateWorkflowCurrentStep(workflow.id, firstStepId);
        console.log(`Set currentStepId for workflow ${workflow.id} to ${firstStepId}`);
      }
    }

    // Return the complete workflow
    return this.dbService.getWorkflow(workflow.id) as Promise<Workflow>;
  }

  /**
   * Handle a user message using the JSON response approach
   */
  async handleJsonMessage(workflowId: string, stepId: string, userInput: string): Promise<{
    response: string;
    nextStep?: any;
    isComplete: boolean;
    generatedAsset?: string;
    debug?: any;
  }> {
    try {
      logger.info('Processing message with JSON workflow', {
        workflowId,
        stepId,
        userInputLength: userInput.length
      });

      // 1. Get current workflow and step
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const currentStep = workflow.steps.find(s => s.id === stepId);
      if (!currentStep) {
        throw new Error(`Step not found: ${stepId}`);
      }
      
      // If this is the first time processing this step and no initialPromptSent flag is set
      // Send the prompt to the user
      if (currentStep.prompt && !currentStep.metadata?.initialPromptSent) {
        await this.addDirectMessage(workflow.threadId, currentStep.prompt);
        
        // Mark that we've sent the prompt
        await this.dbService.updateStep(currentStep.id, {
          metadata: { ...currentStep.metadata, initialPromptSent: true }
        });
        
        logger.info(`Sent initial prompt for JSON step ${currentStep.name} in handleJsonMessage`);
      }

      // Special case for Test Step Transitions, Step 4
      const template = await this.dbService.getTemplate(workflow.templateId);
      const isTestWorkflow = template && template.name === WORKFLOW_TYPES.TEST_STEP_TRANSITIONS;
      const isFinalStep = currentStep.name === "Step 4";
      const isCorrectInput = userInput.trim() === "4";
      
      if (isTestWorkflow && isFinalStep && isCorrectInput) {
        logger.info('Test workflow final step (Step 4) detected in handleJsonMessage', {
          workflowId,
          threadId: workflow.threadId
        });
        
        // Process with handleJsonDialogStep which now has special handling for this case
        return await this.handleJsonDialogStep(currentStep, userInput);
      }

      // 2. Handle user input based on current step type - use standard JSON dialog for all steps
      if (currentStep.name === "Asset Generation") {
        return await this.handleJsonAssetGeneration(workflow, currentStep, userInput);
      } else if (currentStep.name === "Asset Revision") {
        return await this.handleJsonAssetRevision(workflow, currentStep, userInput);
      } else {
        // Handle all other JSON Dialog steps (including Information Collection) with standard processing
        return await this.handleJsonDialogStep(currentStep, userInput);
      }
    } catch (error) {
      logger.error('Error handling JSON message', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle workflow completion and potential transitions
   */
  async handleWorkflowCompletion(workflow: Workflow, threadId: string): Promise<{
    newWorkflow?: Workflow;
    selectedWorkflow?: string;
    message?: string;
  }> {
    try {
      // Check if this is the base workflow
      const baseTemplateFromDB = await this.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
      
      if (workflow.templateId === baseTemplateFromDB?.id) {
        console.log('Base workflow completed. Checking for next workflow selection...');
        
        // Get the workflow selection
        const completedBaseWorkflow = await this.getWorkflow(workflow.id);
        const selectionStep = completedBaseWorkflow?.steps.find(s => s.name === "Workflow Selection");
        const selectedWorkflowName = selectionStep?.aiSuggestion || selectionStep?.userInput;
        
        if (selectedWorkflowName) {
          console.log(`User selected: ${selectedWorkflowName}`);
          
          // Try to find and create the selected workflow
          let nextTemplate = await this.getTemplateByName(selectedWorkflowName);
          
          // Try fuzzy matching if exact match fails
          if (!nextTemplate) {
            const availableTemplates = ["Launch Announcement", "JSON Dialog PR Workflow", "Quick Press Release", "Test Step Transitions", "Dummy Workflow"];
            for (const templateName of availableTemplates) {
              if (templateName.toLowerCase().includes(selectedWorkflowName.toLowerCase()) || 
                  selectedWorkflowName.toLowerCase().includes(templateName.toLowerCase())) {
                console.log(`Found fuzzy match: "${templateName}" for "${selectedWorkflowName}"`);
                nextTemplate = await this.getTemplateByName(templateName);
                break;
              }
            }
          }
          
          if (nextTemplate) {
            console.log(`Creating workflow for "${selectedWorkflowName}"`);
            const nextWorkflow = await this.createWorkflow(threadId, nextTemplate.id);
            return { 
              newWorkflow: nextWorkflow, 
              selectedWorkflow: selectedWorkflowName 
            };
          } else {
            console.warn(`Template not found for selection: ${selectedWorkflowName}`);
            return { 
              message: `Sorry, I couldn't find a workflow template named "${selectedWorkflowName}".` 
            };
          }
        }
      }
      
      // Standard workflow completion
      return { 
        message: `${workflow.templateId || 'Workflow'} completed successfully.` 
      };
    } catch (error) {
      logger.error('Error handling workflow completion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        workflowId: workflow.id
      });
      return { 
        message: 'Error completing workflow.' 
      };
    }
  }

  /**
   * Check if a step should auto-execute and handle it if so
   */
  async checkAndHandleAutoExecution(stepId: string, workflowId: string, threadId: string): Promise<{
    autoExecuted: boolean;
    result?: any;
    nextWorkflow?: Workflow;
  }> {
    try {
      const step = await this.dbService.getStep(stepId);
      if (!step) return { autoExecuted: false };

      // Check if this step should auto-execute
      const shouldAutoExecute = (step.stepType === StepType.GENERATE_THREAD_TITLE || 
                                step.stepType === StepType.API_CALL) && 
                               !!step.metadata?.autoExecute;

      if (!shouldAutoExecute) {
        return { autoExecuted: false };
      }

      logger.info('Auto-executing step', {
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        workflowId
      });

      // Execute the step automatically
      const autoExecResult = await this.handleStepResponse(stepId, "auto-execute");
      
      // Check if this resulted in a workflow transition
      if (autoExecResult.isComplete) {
        const workflow = await this.dbService.getWorkflow(workflowId);
        if (workflow) {
          const completionResult = await this.handleWorkflowCompletion(workflow, threadId);
          
          if (completionResult.newWorkflow) {
            return {
              autoExecuted: true,
              result: autoExecResult,
              nextWorkflow: completionResult.newWorkflow
            };
          }
        }
      }

      return {
        autoExecuted: true,
        result: autoExecResult
      };
    } catch (error) {
      logger.error('Error in auto-execution check', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stepId
      });
      return { autoExecuted: false };
    }
  }
}