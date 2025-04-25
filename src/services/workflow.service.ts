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

  constructor() {
    this.dbService = new WorkflowDBService();
    this.openAIService = new OpenAIService();
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

  // Workflow Management
  async createWorkflow(threadId: string, templateId: string): Promise<Workflow> {
    console.log(`Proceeding to create workflow with templateId: ${templateId} for threadId: ${threadId}`);

    // Ensure the template exists before creating workflow record
    const template = await this.dbService.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    console.log(`Using template "${template.name}" with ${template.steps?.length || 0} steps defined.`);

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
      for (let i = 0; i < template.steps.length; i++) {
        const stepDefinition = template.steps[i];
        
        // Log the definition being used for this iteration
        console.log(`Creating step ${i} from definition: ${JSON.stringify({name: stepDefinition.name, prompt: stepDefinition.prompt})}`);

        const createdStep = await this.dbService.createStep({
          workflowId: workflow.id,
          stepType: stepDefinition.type,
          name: stepDefinition.name,
          description: stepDefinition.description,
          prompt: stepDefinition.prompt,
          status: i === 0 ? StepStatus.IN_PROGRESS : StepStatus.PENDING,
          order: i,
          dependencies: stepDefinition.dependencies || [],
          metadata: stepDefinition.metadata || {}
        });
        // dbService.createStep logging will confirm insertion details

        if (i === 0) {
          firstStepId = createdStep.id;
        }
      }

      if (firstStepId) {
        await this.dbService.updateWorkflowCurrentStep(workflow.id, firstStepId);
        console.log(`Set currentStepId for workflow ${workflow.id} to ${firstStepId}`);
        return this.dbService.getWorkflow(workflow.id) as Promise<Workflow>;
      }
    }

    console.log(`Workflow ${workflow.id} created with no steps or first step ID not set.`);
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

      // If user input exactly matches one of the options, use it directly
      const exactMatch = availableOptions.find(option => 
        option.toLowerCase() === userInput.toLowerCase()
      );
      
      if (exactMatch) {
        logger.info('Found exact match for workflow selection', { userInput, match: exactMatch });
        await this.dbService.updateStep(stepId, {
          aiSuggestion: exactMatch
        });
        
        // Add a direct message about the exact match
        await this.addDirectMessage(workflow.threadId, `Selected workflow: ${exactMatch}`);
        
        return exactMatch;
      }

      // Check for partial matches before using OpenAI
      const partialMatches = availableOptions.filter(option => 
        option.toLowerCase().includes(userInput.toLowerCase()) || 
        userInput.toLowerCase().includes(option.toLowerCase().split(' ')[0])
      );
      
      if (partialMatches.length === 1) {
        logger.info('Found partial match for workflow selection', { userInput, match: partialMatches[0] });
        await this.dbService.updateStep(stepId, {
          aiSuggestion: partialMatches[0]
        });
        
        // Add a direct message about the partial match
        await this.addDirectMessage(workflow.threadId, `Selected workflow: ${partialMatches[0]} (based on partial match)`);
        
        return partialMatches[0];
      }

      // Otherwise, use OpenAI to find the closest match
      const openAIResult = await this.openAIService.generateStepResponse(step, userInput, []);
      
      // Store OpenAI prompt and response data
      await this.dbService.updateStep(stepId, {
        openAIPrompt: openAIResult.promptData,
        openAIResponse: openAIResult.rawResponse
      });
      
      // Validate the OpenAI response against available options
      const matchedOption = availableOptions.find(option => 
        openAIResult.responseText.includes(option)
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

      // If no match found yet, default to the most appropriate option
      // For "launch" related inputs, use "Launch Announcement"
      if (userInput.toLowerCase().includes('launch')) {
        const defaultOption = availableOptions.find(opt => opt.includes('Launch')) || availableOptions[0];
        logger.info('Using launch-related default option', { userInput, defaultOption });
        await this.dbService.updateStep(stepId, {
          aiSuggestion: defaultOption
        });
        
        // Add a direct message about the default
        await this.addDirectMessage(workflow.threadId, `Selected workflow: ${defaultOption} (based on keyword match)`);
        
        return defaultOption;
      }

      // If OpenAI doesn't return a valid match, default to the first option
      logger.warn('No valid workflow match found, defaulting to first option', { 
        userInput, 
        openAIResponse: openAIResult.responseText, 
        defaultOption: availableOptions[0] 
      });
      
      await this.dbService.updateStep(stepId, {
        aiSuggestion: availableOptions[0]
      });
      
      // Add a direct message about the default
      await this.addDirectMessage(workflow.threadId, `Selected workflow: ${availableOptions[0]} (default)`);
      
      return availableOptions[0];
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
        await this.processWorkflowSelection(stepId, userInput);
      } else if (step.name === "Thread Title and Summary") {
        await this.processThreadTitle(stepId, userInput);
      }

      // 2. Update the current step: set userInput and mark as COMPLETE
      await this.dbService.updateStep(stepId, {
        userInput,
        status: StepStatus.COMPLETE
      });

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
        // Update the workflow's current step ID to the next step
        await this.dbService.updateWorkflowCurrentStep(workflowId, nextStep.id);
        // Mark the next step as IN_PROGRESS
        await this.dbService.updateStep(nextStep.id, {
          status: StepStatus.IN_PROGRESS
        });

        // --- Add Logging Here ---
        const nextStepDetails = {
          id: nextStep.id,
          name: nextStep.name,
          prompt: nextStep.prompt, // <<< Check this value
          type: nextStep.stepType
        };
        console.log('handleStepResponse: Found next step. Returning details:', nextStepDetails); 
        // --- End Logging ---

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
          // throw new Error('Workflow inconsistency detected: Cannot determine next step.');
        }
      }
    } catch (error) {
      logger.error('Error handling step response:', error);
      // Re-throw the error to be handled by the caller (e.g., ChatService)
      throw error;
    }
    // Note: Because every path in the try block either returns or throws,
    // and the catch block throws, this point is technically unreachable.
    // The compiler should now be satisfied.
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
      await db.insert(chatMessages)
        .values({
          threadId,
          content,
          role: "assistant",
          userId: "system"
        });
      console.log(`DIRECT MESSAGE ADDED: '${content}' to thread ${threadId}`);
    } catch (error) {
      console.error(`Error adding direct message to thread ${threadId}:`, error);
      // Don't throw error as this is non-critical functionality
    }
  }
} 