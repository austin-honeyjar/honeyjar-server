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
import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { eq } from "drizzle-orm";

export class WorkflowService {
  private dbService: WorkflowDBService;
  private openAIService: OpenAIService;
  private assetService: AssetService;

  constructor() {
    this.dbService = new WorkflowDBService();
    this.openAIService = new OpenAIService();
    this.assetService = new AssetService();
  }

  // Template Management
  async getTemplateByName(name: string): Promise<WorkflowTemplate | null> {
    return this.dbService.getTemplateByName(name);
  }

  async initializeTemplates(): Promise<void> {
    console.log('Initializing templates...');
    const templates = {
      "Base Workflow": BASE_WORKFLOW_TEMPLATE,
      "Dummy Workflow": DUMMY_WORKFLOW_TEMPLATE,
      "Launch Announcement": LAUNCH_ANNOUNCEMENT_TEMPLATE
    };

    for (const [key, template] of Object.entries(templates)) {
      console.log(`Checking template: ${template.name}`);
      const existingTemplate = await this.dbService.getTemplateByName(template.name);
      if (!existingTemplate) {
        console.log(`Creating template: ${template.name}`);
        await this.dbService.createTemplate(template);
      } else {
        console.log(`Template already exists: ${template.name}`);
      }
    }
    console.log('Template initialization complete');
  }

  async getTemplate(templateId: string): Promise<WorkflowTemplate | null> {
    console.log(`Proceeding to get template with id: ${templateId}`);
    
    // Special handling for template ID "1" - check for special UUID equivalent
    if (templateId === "1") {
      const specialUuid = '00000000-0000-0000-0000-000000000001';
      
      // First try to get template by special UUID
      const templateFromDb = await this.dbService.getTemplate(specialUuid);
      
      if (templateFromDb) {
        console.log(`Found template using special UUID for ID ${templateId}`);
        const templateWithId = {
          ...BASE_WORKFLOW_TEMPLATE,
          id: templateId
        };
        return templateWithId;
      }
    }
    
    // For other cases, check database as usual
    const templateFromDb = await this.dbService.getTemplate(templateId);
    if (!templateFromDb) {
      console.log(`Template ID not found in database: ${templateId}`);
      return null;
    }
    
    // Use template name to get most up-to-date version from code
    const name = templateFromDb.name;
    const codeTemplates: Record<string, any> = {
      "Base Workflow": BASE_WORKFLOW_TEMPLATE,
      "Dummy Workflow": DUMMY_WORKFLOW_TEMPLATE,
      "Launch Announcement": LAUNCH_ANNOUNCEMENT_TEMPLATE
    };
    
    // If template exists in code, use that version with DB ID
    if (codeTemplates[name]) {
      console.log(`Using in-code template for ID ${templateId} (${name})`);
      const templateWithId = {
        ...codeTemplates[name],
        id: templateId
      };
      return templateWithId;
    }
    
    // Return database version if not found in code
    return templateFromDb;
  }

  // Workflow Management
  async createWorkflow(threadId: string, templateId: string): Promise<Workflow> {
    console.log(`Proceeding to create workflow with templateId: ${templateId} for threadId: ${threadId}`);

    // Ensure the template exists before creating workflow record
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    console.log(`Using template "${template.name}" with ${template.steps?.length || 0} steps defined.`);

    // Create the workflow first
    const workflow = await this.dbService.createWorkflow({
      threadId,
      templateId,
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
        
        // Log the definition being used for this iteration
        console.log(`Creating step ${i} from definition: ${JSON.stringify({name: stepDefinition.name, prompt: stepDefinition.prompt})}`);

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

        if (isFirstStep && stepDefinition.prompt) {
          firstStepId = createdStep.id;
          // Send the first step's prompt as a message from the AI
          await this.addDirectMessage(threadId, stepDefinition.prompt);
          console.log(`Sent first step prompt as message to thread ${threadId}: "${stepDefinition.prompt}"`);
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
    const baseTemplate = await this.dbService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
    // Added check for baseTemplate existence
    if (!baseTemplate) {
        console.error(`getBaseWorkflowByThreadId: Base template "${BASE_WORKFLOW_TEMPLATE.name}" not found in DB.`);
        return null; 
    }
    return workflows.find((w: Workflow) => w.templateId === baseTemplate.id) || null;
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
    return this.getWorkflow(workflowId) as Promise<Workflow>;
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
      const step = await this.dbService.getStep(stepId);
      if (!step) {
        throw new Error(`Step not found: ${stepId}`);
      }

      // Get the workflow to check for context
      const workflow = await this.dbService.getWorkflow(step.workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found for step: ${stepId}`);
      }
      
      // Check if we're in the Launch Announcement workflow handling the announcement type selection
      // This is a special case where we need to handle sub-types like "Product Launch"
      const template = await this.dbService.getTemplate(workflow.templateId);
      if (template && 
          template.name === "Launch Announcement" && 
          step.name === "Announcement Type Selection") {
        
        // This is within the Launch Announcement workflow, not the base workflow selection
        logger.info('Processing announcement type selection within Launch Announcement workflow', {
          stepId,
          userInput
        });
        
        // Add a direct message about the announcement type
        await this.addDirectMessage(workflow.threadId, `Announcement type selected: ${userInput}`);
        
        // Process normally within the Launch Announcement workflow
        // No need to set aiSuggestion as this is just a sub-type selection
        return userInput;
      }

      // Normal base workflow selection processing
      if (step.name !== "Workflow Selection" || !step.metadata?.options) {
        throw new Error(`Invalid step for workflow selection processing: ${step.name}`);
      }

      const availableOptions = step.metadata.options as string[];
      logger.info('Processing workflow selection', {
        stepId,
        userInput,
        availableOptions
      });

      // Add a direct message to show we're processing the selection
      await this.addDirectMessage(workflow.threadId, `Processing workflow selection: "${userInput}"`);

      // Use OpenAI to find the best match - this is now our ONLY matching method
      const openAIResult = await this.openAIService.generateStepResponse(step, userInput, []);
      
      // Store OpenAI prompt and response data
      await this.dbService.updateStep(stepId, {
        openAIPrompt: openAIResult.promptData,
        openAIResponse: openAIResult.rawResponse
      });
      
      // Log the complete OpenAI response for debugging
      logger.info('OpenAI response for workflow selection', {
        userInput,
        completeResponse: openAIResult.responseText
      });
      
      // Check if OpenAI returned NO_MATCH
      if (openAIResult.responseText.includes('NO_MATCH')) {
        logger.info('OpenAI determined no good match for input', { 
          userInput, 
          openAIResponse: openAIResult.responseText
        });
        
        // Add a direct message about the lack of match
        await this.addDirectMessage(
          workflow.threadId, 
          `I couldn't determine which workflow you want. Please explicitly choose one of: ${availableOptions.join(', ')}.`
        );
        
        // Don't update the aiSuggestion, don't complete the step
        await this.dbService.updateStep(stepId, {
          status: StepStatus.IN_PROGRESS // Keep the step in progress
        });
        
        // Return empty string to indicate no valid selection was made
        return '';
      }
      
      // Check if OpenAI's response exactly matches one of our available options
      // Normalize the response by trimming and converting to lowercase for comparison
      const normalizedResponse = openAIResult.responseText.trim();
      const matchedOption = availableOptions.find(option => 
        normalizedResponse === option || normalizedResponse.includes(option)
      );

      if (matchedOption) {
        logger.info('OpenAI matched workflow selection', { 
          userInput, 
          openAIResponse: openAIResult.responseText, 
          matchedOption 
        });
        
        // Update the step with the matched workflow type
        await this.dbService.updateStep(stepId, {
          aiSuggestion: matchedOption
        });
        
        // Add a direct message about the AI match
        await this.addDirectMessage(workflow.threadId, `Selected workflow: ${matchedOption} (based on AI matching)`);
        
        return matchedOption;
      }
      
      // If we get here, OpenAI returned something, but it didn't match our options
      // This shouldn't happen with proper prompting, but let's handle it
      logger.warn('OpenAI returned unexpected response for workflow selection', {
        userInput,
        openAIResponse: openAIResult.responseText,
        availableOptions
      });
      
      // Add a direct message about the unexpected response
      await this.addDirectMessage(
        workflow.threadId, 
        `I received an unexpected response. Please explicitly choose one of: ${availableOptions.join(', ')}.`
      );
      
      // Keep the step in progress
      await this.dbService.updateStep(stepId, {
        status: StepStatus.IN_PROGRESS
      });
      
      // Return empty string to indicate no valid selection was made
      return '';
    } catch (error) {
      logger.error('Error processing workflow selection', { error });
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
      
      // Add a direct message about processing the title
      await this.addDirectMessage(workflow.threadId, `Processing thread title: "${userInput}"`);
      
      // Use OpenAI to generate a subtitle
      const openAIResult = await this.openAIService.generateStepResponse(step, userInput, []);
      console.log(`SUBTITLE GENERATED: '${openAIResult.responseText}'`);
      
      // Store OpenAI prompt and response data
      await this.dbService.updateStep(stepId, {
        openAIPrompt: openAIResult.promptData,
        openAIResponse: openAIResult.rawResponse
      });
      
      // Extract subtitle from response (format: "SUBTITLE: [subtitle text]")
      let subtitle = openAIResult.responseText;
      if (openAIResult.responseText.includes('SUBTITLE:')) {
        subtitle = openAIResult.responseText.split('SUBTITLE:')[1].trim();
      }
      
      logger.info('Generated thread subtitle', { userInput, subtitle });
      console.log(`FINAL SUBTITLE: '${subtitle}'`);
      
      // Update the step with the generated subtitle
      await this.dbService.updateStep(stepId, {
        aiSuggestion: subtitle
      });
      
      // Add a direct message with the title and subtitle
      await this.addDirectMessage(
        workflow.threadId, 
        `Thread title set to: ${userInput}\nGenerated subtitle: ${subtitle.replace(/Thread Title:.*?Subtitle:/i, '')}`
      );
      
      // Update the thread title in the database
      await this.updateThreadTitleInDB(workflow.threadId, userInput, subtitle);
      
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
                
                // Add message with revised asset
                await this.addDirectMessage(
                  workflow.threadId, 
                  `Here's your revised ${selectedAsset} with the requested changes:\n\n${result.responseText}`
                );
                
                // Store revised asset
                await this.dbService.updateStep(stepId, {
                  metadata: { 
                    ...step.metadata,
                    revisedAsset: result.responseText
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

      // 4. Find the next pending step whose dependencies are met
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

      // 5. If a next step is found
      if (nextStep) {
        // Create nextStepDetails object for returning
        const nextStepDetails = {
          id: nextStep.id,
          name: nextStep.name,
          prompt: nextStep.prompt,
          type: nextStep.stepType
        };
        
        // Special handling for Asset Selection step to ensure prompt shows the right assets
        if (nextStep.name === "Asset Selection") {
          // Get the announcement type from the previous step
          const announcementTypeStep = updatedWorkflow.steps.find(s => s.name === "Announcement Type Selection");
          const announcementType = announcementTypeStep?.userInput || "Product Launch";
          
          // Customize the prompt based on announcement type
          const customPrompt = this.getAssetSelectionPrompt(announcementType);
          
          // Update the next step with the customized prompt
          await this.dbService.updateStep(nextStep.id, {
            prompt: customPrompt
          });
          
          // Update the nextStepDetails prompt
          nextStepDetails.prompt = customPrompt;
        }
        
        // Special handling for Asset Confirmation step
        else if (nextStep.name === "Asset Confirmation") {
          // Get the selected asset from the previous step
          const assetSelectionStep = updatedWorkflow.steps.find(s => s.name === "Asset Selection");
          const selectedAsset = assetSelectionStep?.userInput || "Press Release";
          
          // Customize the prompt to include the selected asset
          const customPrompt = `You've selected to generate a ${selectedAsset}. Would you like to proceed with this selection? (Reply with 'yes' to confirm or 'no' to change your selection)`;
          
          // Update the next step with the customized prompt
          await this.dbService.updateStep(nextStep.id, {
            prompt: customPrompt,
            metadata: { ...nextStep.metadata, selectedAsset }
          });
          
          // Update the nextStepDetails prompt
          nextStepDetails.prompt = customPrompt;
        }
        
        // Special handling for Information Collection step
        else if (nextStep.name === "Information Collection") {
          // Get the selected asset from previous steps
          const assetSelectionStep = updatedWorkflow.steps.find(s => s.name === "Asset Selection");
          const selectedAsset = assetSelectionStep?.userInput || "Press Release";
          
          // Different prompts based on asset type
          let customPrompt = "";
          
          // Press Release specific fields
          if (selectedAsset.toLowerCase().includes("press release")) {
            customPrompt = `To generate your ${selectedAsset}, I need the following specific information:

- Company Name
- Company Description (what your company does)
- Product/Service Name
- Product Description
- Key Features (3-5 points)
- Target Market/Audience
- CEO Name and Title (for quote)
- Quote from CEO or Executive
- Launch/Announcement Date
- Pricing Information
- Availability Date/Location
- Call to Action
- PR Contact Name
- PR Contact Email/Phone
- Company Website

Please provide as much of this information as possible in a single message. The more details you provide, the better the ${selectedAsset} will be.`;
          } 
          // Media Pitch specific fields
          else if (selectedAsset.toLowerCase().includes("media pitch")) {
            customPrompt = `To generate your ${selectedAsset}, I need the following specific information:

- Company Name
- Company Description
- News/Announcement Summary
- Why This Is Newsworthy
- Target Media Outlets/Journalists
- Spokesperson Name and Title
- Key Media Hooks/Angles
- Supporting Data/Statistics
- Available Resources (interviews, demos, etc.)
- Timeline/Embargo Information
- PR Contact Information

Please provide as much of this information as possible in a single message. The more details you provide, the better the ${selectedAsset} will be.`;
          }
          // Social Post specific fields
          else if (selectedAsset.toLowerCase().includes("social")) {
            customPrompt = `To generate your ${selectedAsset}, I need the following specific information:

- Company Name
- Brand Voice/Tone
- Announcement Summary
- Key Benefit to Highlight
- Target Audience
- Call to Action
- Relevant Hashtags
- Link to Include
- Platforms (LinkedIn, Twitter, Facebook, Instagram)
- Visual Assets Available

Please provide as much of this information as possible in a single message. The more details you provide, the better the ${selectedAsset} will be.`;
          }
          // Default fields for other asset types
          else {
            customPrompt = `To generate your ${selectedAsset}, I need the following specific information:

- Company Name
- Product/Service Name
- Key Information Points
- Target Audience
- Main Benefit or Value Proposition
- Call to Action
- Timeline or Important Dates
- Contact Information

Please provide as much of this information as possible in a single message. The more details you provide, the better the ${selectedAsset} will be.`;
          }
          
          // Update the next step with the customized prompt
          await this.dbService.updateStep(nextStep.id, {
            prompt: customPrompt,
            metadata: { ...nextStep.metadata, selectedAsset }
          });
          
          // Update the nextStepDetails prompt
          nextStepDetails.prompt = customPrompt;
        }
        
        // Special handling for Asset Generation step
        else if (nextStep.name === "Asset Generation") {
          // Get the confirmed asset type from the previous steps
          const assetSelectionStep = updatedWorkflow.steps.find(s => s.name === "Asset Selection");
          const selectedAsset = assetSelectionStep?.userInput || "Press Release";
          
          // Get the information collection step to use the input for generation
          const infoStep = updatedWorkflow.steps.find(s => s.name === "Information Collection");
          
          if (infoStep && infoStep.userInput && infoStep.userInput.trim().toLowerCase() !== "provide info") {
            // Generate the asset immediately in this step
            try {
              // Find the appropriate template for the selected asset
              const templateKey = selectedAsset.toLowerCase().replace(/\s+/g, '');
              const templateMap: Record<string, string> = {
                'pressrelease': 'pressRelease',
                'mediapitch': 'mediaPitch',
                'socialpost': 'socialPost',
                'blogpost': 'blogPost',
                'faqdocument': 'faqDocument'
              };
              
              const templateName = templateMap[templateKey] || 'pressRelease';
              const template = nextStep.metadata?.templates?.[templateName];
              
              if (template) {
                logger.info('Generating asset', { selectedAsset, templateName });
                
                // Create a custom step with the template as instructions
                const customStep = {
                  ...nextStep,
                  metadata: {
                    ...nextStep.metadata,
                    openai_instructions: template
                  }
                };
                
                // First, add a message that we're generating the asset
                await this.addDirectMessage(updatedWorkflow.threadId, `Generating your ${selectedAsset}. This may take a moment...`);
                
                // Generate the asset using OpenAI
                const openAIResult = await this.openAIService.generateStepResponse(
                  customStep,
                  infoStep.userInput,
                  [] // No context needed
                );
                
                // Store the generated asset
                await this.dbService.updateStep(nextStep.id, {
                  metadata: { 
                    ...nextStep.metadata, 
                    generatedAsset: openAIResult.responseText,
                    selectedAsset
                  }
                });
                
                // Add the generated asset as a direct message to show the user
                await this.addDirectMessage(updatedWorkflow.threadId, `Here's your generated ${selectedAsset}:\n\n${openAIResult.responseText}`);
              }
            } catch (error) {
              logger.error('Error generating asset', { error });
              // Add an error message to the thread
              await this.addDirectMessage(updatedWorkflow.threadId, `There was an error generating your ${selectedAsset}. Please try again.`);
            }
          } else {
            // The user just typed "provide info" without actual information
            // Update the prompt to indicate we're waiting for their detailed information
            const customPrompt = `I'm ready to generate your ${selectedAsset}. Please provide the requested information now.`;
            
            // Update the nextStepDetails to stay on the Information Collection step
            // This should prevent the flow from advancing to Asset Generation
            const infoStepId = infoStep?.id;
            
            if (infoStepId) {
              // Update workflow to stay on Information Collection step
              await this.dbService.updateWorkflowCurrentStep(workflowId, infoStepId);
              
              // Rollback the Information Collection step to IN_PROGRESS
              await this.dbService.updateStep(infoStepId, {
                status: StepStatus.IN_PROGRESS
              });
              
              // Add a message to guide the user
              await this.addDirectMessage(updatedWorkflow.threadId, 
                `I need detailed information to generate your ${selectedAsset}. Please provide the information requested above.`);
              
              // This will cause the workflow to stay on the Information Collection step
              return {
                response: `Please provide the information needed for your ${selectedAsset}.`,
                nextStep: {
                  id: infoStepId,
                  name: infoStep?.name,
                  prompt: infoStep?.prompt,
                  type: infoStep?.stepType
                },
                isComplete: false
              };
            }
          }
          
          // Store the selected asset in the metadata for later use
          await this.dbService.updateStep(nextStep.id, {
            metadata: { ...nextStep.metadata, selectedAsset }
          });
        }
        
        // Special handling for Asset Review step
        else if (nextStep.name === "Asset Review") {
          // Get the selected asset type and generated asset
          const assetGenerationStep = updatedWorkflow.steps.find(s => s.name === "Asset Generation");
          const selectedAsset = assetGenerationStep?.metadata?.selectedAsset || "Press Release";
          const generatedAsset = assetGenerationStep?.metadata?.generatedAsset || "";
          
          // Update the prompt to include the generated asset
          if (generatedAsset) {
            const customPrompt = `Here's your generated ${selectedAsset}:\n\n${generatedAsset}\n\nPlease review it and let me know what specific changes you'd like to make, if any. If you're satisfied, simply reply with 'approved'.`;
            
            // Update the next step with the customized prompt
            await this.dbService.updateStep(nextStep.id, {
              prompt: customPrompt,
              metadata: { 
                ...nextStep.metadata, 
                generatedAsset,
                selectedAsset,
                // Add flags to track approval status - initially false
                approved: false,
                needsRevision: false
              }
            });
            
            // Update the nextStepDetails prompt
            nextStepDetails.prompt = customPrompt;
          }
        }
        
        // Special handling for Asset Revision step - check if we need to process revisions
        else if (nextStep.name === "Asset Revision") {
          // Get the Asset Review step to check its approval status
          const assetReviewStep = updatedWorkflow.steps.find(s => s.name === "Asset Review");
          
          if (assetReviewStep && assetReviewStep.userInput) {
            // Check if the asset was approved - expanded pattern matching for approval
            const isApproved = 
              assetReviewStep.userInput.toLowerCase().includes('approved') || 
              assetReviewStep.userInput.toLowerCase() === 'approve' || 
              assetReviewStep.userInput.toLowerCase() === 'yes' ||
              assetReviewStep.userInput.toLowerCase().includes('no more') ||
              assetReviewStep.userInput.toLowerCase().includes('looks good') ||
              assetReviewStep.userInput.toLowerCase().includes('this is good');
            
            console.log(`Asset Revision step checking approval status: "${assetReviewStep.userInput}" => isApproved: ${isApproved}`);
            
            if (isApproved) {
              // If approved, mark the Asset Review step metadata
              await this.dbService.updateStep(assetReviewStep.id, {
                metadata: { ...assetReviewStep.metadata, approved: true, needsRevision: false }
              });
              
              // Skip the Asset Revision step and go directly to Post-Asset Tasks
              const postAssetTaskStep = updatedWorkflow.steps.find(s => s.name === "Post-Asset Tasks");
              
              if (postAssetTaskStep) {
                // Update the Asset Revision step to COMPLETE (skipped)
                await this.dbService.updateStep(nextStep.id, {
                  status: StepStatus.COMPLETE,
                  userInput: "Asset approved - revision skipped"
                });
                
                // Update workflow to point to Post-Asset Tasks
                await this.dbService.updateWorkflowCurrentStep(workflowId, postAssetTaskStep.id);
                
                // Update Post-Asset Tasks step to IN_PROGRESS
                await this.dbService.updateStep(postAssetTaskStep.id, {
                  status: StepStatus.IN_PROGRESS
                });
                
                // Add a message that we're proceeding to Post-Asset Tasks
                await this.addDirectMessage(updatedWorkflow.threadId, `Asset approved. Proceeding to Post-Asset Tasks.`);
                
                // Return Post-Asset Tasks as the next step
                return {
                  response: `Step "${step.name}" completed. Proceeding to step "Post-Asset Tasks".`,
                  nextStep: {
                    id: postAssetTaskStep.id,
                    name: postAssetTaskStep.name,
                    prompt: postAssetTaskStep.prompt,
                    type: postAssetTaskStep.stepType
                  },
                  isComplete: false
                };
              }
            }
          }
        }
        
        // Special handling for Post-Asset Tasks step - Process Asset Review feedback
        else if (nextStep.name === "Post-Asset Tasks") {
          // Check if the Asset Review step has feedback
          const assetReviewStep = updatedWorkflow.steps.find(s => s.name === "Asset Review");
          
          if (assetReviewStep && assetReviewStep.userInput && 
              assetReviewStep.userInput.toLowerCase() !== "approved" && 
              !assetReviewStep.metadata?.regenerated) {
            
            try {
              logger.info('Changes requested, regenerating asset');
              
              // Get the needed steps
              const assetGenerationStep = updatedWorkflow.steps.find(s => s.name === "Asset Generation");
              const infoStep = updatedWorkflow.steps.find(s => s.name === "Information Collection");
              const selectedAsset = assetReviewStep.metadata?.selectedAsset || "Press Release";
              const generatedAsset = assetReviewStep.metadata?.generatedAsset || "";
              
              // Get the user's feedback
              const userFeedback = assetReviewStep.userInput;
              
              // Create the revised prompt
              const revisedPrompt = `${infoStep?.userInput || ""}\n\nPlease make the following changes to the previous version:\n- ${userFeedback}`;
              
              // Find the appropriate template
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
                // First, add a message that we're regenerating the asset
                await this.addDirectMessage(updatedWorkflow.threadId, `Regenerating your ${selectedAsset} with your requested changes. This may take a moment...`);
                
                // Create a custom step with the template as instructions
                const customStep = {
                  ...assetGenerationStep,
                  metadata: {
                    ...assetGenerationStep.metadata,
                    openai_instructions: template
                  }
                };
                
                // Generate the revised asset
                const openAIResult = await this.openAIService.generateStepResponse(
                  customStep,
                  revisedPrompt,
                  [] // No context needed
                );
                
                // Add the revised asset as a direct message
                await this.addDirectMessage(
                  updatedWorkflow.threadId, 
                  `Here's your revised ${selectedAsset} with the requested changes:\n\n${openAIResult.responseText}`
                );
                
                // Mark as regenerated to avoid duplicate regeneration
                await this.dbService.updateStep(assetReviewStep.id, {
                  metadata: { 
                    ...assetReviewStep.metadata, 
                    regenerated: true,
                    revisedAsset: openAIResult.responseText
                  }
                });
                
                // Find the Asset Revision step
                const assetRevisionStep = updatedWorkflow.steps.find(s => s.name === "Asset Revision");
                
                if (assetRevisionStep) {
                  // Set the Asset Revision step as COMPLETE to allow another review
                  await this.dbService.updateStep(assetRevisionStep.id, {
                    status: StepStatus.COMPLETE,
                    userInput: "Revision completed"
                  });
                  
                  // Reset the Asset Review step to IN_PROGRESS to allow another round of feedback
                  await this.dbService.updateStep(assetReviewStep.id, {
                    status: StepStatus.IN_PROGRESS,
                    // Clear the userInput to allow new feedback
                    userInput: ""
                  });
                  
                  // Change workflow to point back to the Asset Review step instead of proceeding
                  await this.dbService.updateWorkflowCurrentStep(workflowId, assetReviewStep.id);
                  
                  // Create a custom prompt for the Asset Review step that includes the revised asset
                  const revisedAssetReviewPrompt = `Here's your revised ${selectedAsset}. Please review it and let me know what specific changes you'd like to make, if any. If you're satisfied, simply reply with 'approved'.`;
                  
                  // Update the Asset Review step with the new prompt
                  await this.dbService.updateStep(assetReviewStep.id, {
                    prompt: revisedAssetReviewPrompt
                  });
                  
                  // Return early with Asset Review as the next step
                  return {
                    response: `Your ${selectedAsset} has been revised. Please review the changes.`,
                    nextStep: {
                      id: assetReviewStep.id,
                      name: assetReviewStep.name,
                      prompt: revisedAssetReviewPrompt,
                      type: assetReviewStep.stepType
                    },
                    isComplete: false
                  };
                }
              }
            } catch (error) {
              logger.error('Error processing asset review feedback', { error });
              // Add an error message
              await this.addDirectMessage(updatedWorkflow.threadId, `There was an error regenerating your ${assetReviewStep.metadata?.selectedAsset || "asset"}. Please try again.`);
              
              // Return to Asset Review step to try again
              return {
                response: 'There was a problem with your revision. Please try again.',
                nextStep: {
                  id: assetReviewStep.id,
                  name: assetReviewStep.name,
                  prompt: assetReviewStep.prompt, 
                  type: assetReviewStep.stepType
                },
                isComplete: false
              };
            }
          }
        }
        
        // Update the workflow's current step ID to the next step
        await this.dbService.updateWorkflowCurrentStep(workflowId, nextStep.id);
        // Mark the next step as IN_PROGRESS
        await this.dbService.updateStep(nextStep.id, {
          status: StepStatus.IN_PROGRESS
        });

        return {
          response: `Step "${step.name}" completed. Proceeding to step "${nextStep.name}".`,
          nextStep: nextStepDetails, // Return the logged object
          isComplete: false // Workflow is not complete
        };
      } else {
        // 6. If NO next step is found, the workflow should be complete.
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
      console.log(`DIRECT MESSAGE ADDED: '${messageContent.substring(0, 50)}...' to thread ${threadId}`);
    } catch (error) {
      console.error(`Error adding direct message to thread ${threadId}:`, error);
      // Don't throw error as this is non-critical functionality
    }
  }

  // Helper method to get recommended assets for an announcement type
  private getAssetSelectionPrompt(announcementType: string): string {
    // Map of announcement types to their recommended assets
    const assetsByType: Record<string, string[]> = {
      "Product Launch": ["Press Release", "Media Pitch", "Social Post", "Blog Post", "FAQ Document"],
      "Funding Round": ["Press Release", "Media Pitch", "Social Post", "Talking Points"],
      "Partnership": ["Press Release", "Media Pitch", "Social Post", "Email Announcement"],
      "Company Milestone": ["Press Release", "Social Post", "Blog Post", "Email Announcement"],
      "Executive Hire": ["Press Release", "Media Pitch", "Social Post", "Talking Points"],
      "Industry Award": ["Press Release", "Social Post", "Blog Post"]
    };
    
    // Find the matching announcement type (case-insensitive)
    const normalizedType = Object.keys(assetsByType).find(
      type => type.toLowerCase().includes(announcementType.toLowerCase()) ||
             announcementType.toLowerCase().includes(type.toLowerCase())
    ) || "Product Launch";
    
    // Get the appropriate assets
    const assets = assetsByType[normalizedType];
    
    // Asset descriptions
    const assetDescriptions: Record<string, string> = {
      "Press Release": "Official announcement document for media distribution",
      "Media Pitch": "Personalized outreach to journalists/publications",
      "Social Post": "Content for social media platforms",
      "Blog Post": "Detailed article for company website/blog",
      "FAQ Document": "Anticipated questions and prepared answers",
      "Email Announcement": "Communication for customers/subscribers",
      "Talking Points": "Key messages for spokespeople"
    };
    
    // Build the prompt
    let prompt = `Based on your ${normalizedType.toLowerCase()} announcement, we recommend the following assets:\n\n`;
    
    // Add each asset with its description
    assets.forEach(asset => {
      prompt += `- ${asset}: ${assetDescriptions[asset] || ""}\n`;
    });
    
    prompt += `\nWhich of these would you like to generate?`;
    
    return prompt;
  }
}