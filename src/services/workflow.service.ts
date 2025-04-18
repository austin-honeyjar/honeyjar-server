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
      return activeWorkflows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
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
} 