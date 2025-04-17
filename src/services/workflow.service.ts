import {
  Workflow,
  WorkflowStep,
  WorkflowTemplate,
  StepStatus,
  WorkflowStatus,
  StepType,
} from "../types/workflow";
import { LAUNCH_ANNOUNCEMENT_TEMPLATE } from "../templates/workflows/launch-announcement";
import {WorkflowDBService} from "./workflowDB.service";
import { OpenAIService } from './openai.service';
import logger from '../utils/logger';

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
    const template = await this.dbService.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Create workflow
    const workflow = await this.dbService.createWorkflow({
      threadId,
      templateId,
      status: WorkflowStatus.ACTIVE,
      currentStepId: null // Ensure this is explicitly set to null initially
    });

    // Create steps with proper dependencies and order
    const steps = await Promise.all(
      template.steps.map(async (step, index) => {
        const stepData = {
          workflowId: workflow.id,
          stepType: step.type,
          name: step.name,
          description: step.description,
          prompt: step.prompt,
          status: index === 0 ? StepStatus.IN_PROGRESS : StepStatus.PENDING,
          order: index,
          dependencies: step.dependencies || [],
          metadata: step.metadata || {},
        };

        const createdStep = await this.dbService.createStep(stepData);
        
        // If this is the first step, set it as the current step
        if (index === 0) {
          await this.dbService.updateWorkflowCurrentStep(workflow.id, createdStep.id);
          workflow.currentStepId = createdStep.id;
        }

        return createdStep;
      })
    );

    return {
      ...workflow,
      steps
    };
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    return this.dbService.getWorkflow(id);
  }

  async getWorkflowByThreadId(threadId: string): Promise<Workflow | null> {
    return this.dbService.getWorkflowByThreadId(threadId);
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
    response: string;
    nextStep?: any;
    isComplete: boolean;
  }> {
    try {
      // Get the current step and workflow
      const step = await this.dbService.getStep(stepId);
      if (!step) throw new Error('Step not found');

      const workflow = await this.dbService.getWorkflow(step.workflowId);
      if (!workflow) throw new Error('Workflow not found');

      // Sort steps by order to ensure proper sequence
      const sortedSteps = workflow.steps.sort((a, b) => a.order - b.order);

      // If this is the first step, set it as current
      if (workflow.currentStepId === null && step.order === 0) {
        await this.dbService.updateWorkflowCurrentStep(workflow.id, stepId);
        await this.dbService.updateStep(stepId, { status: StepStatus.IN_PROGRESS });
        workflow.currentStepId = stepId;
      }

      // Verify this is the current step
      if (workflow.currentStepId !== stepId) {
        throw new Error('Cannot process step: not the current step');
      }

      // Check dependencies
      const incompleteDependencies = sortedSteps.filter(s => 
        step.dependencies.includes(s.name) && s.status !== StepStatus.COMPLETE
      );
      if (incompleteDependencies.length > 0) {
        throw new Error('Cannot process step: dependencies not complete');
      }

      // Get previous step responses for context, ensuring proper order
      const previousSteps = sortedSteps
        .filter(s => s.order < step.order && s.status === StepStatus.COMPLETE)
        .map(s => ({
          stepName: s.name,
          response: s.userInput || '',
          order: s.order
        }));

      // Generate AI response based on step type
      let aiResponse;
      if (step.stepType === 'user_input') {
        aiResponse = await this.openAIService.generateStepResponse(
          step,
          userInput,
          previousSteps
        );
      } else if (step.stepType === 'ai_suggestion') {
        aiResponse = await this.openAIService.generateStepResponse(
          step,
          userInput,
          previousSteps
        );
      } else {
        aiResponse = step.prompt || 'Please provide the required information.';
      }

      // Update current step with user input and AI response
      await this.dbService.updateStep(stepId, {
        userInput,
        aiSuggestion: aiResponse,
        status: StepStatus.COMPLETE
      });

      // Find the next step based on order and dependencies
      const nextStep = sortedSteps
        .filter(s => s.order > step.order && s.status === StepStatus.PENDING)
        .find(s => 
          s.dependencies.every(dep => 
            sortedSteps.find(ws => ws.name === dep)?.status === StepStatus.COMPLETE
          )
        );

      const isComplete = !nextStep;

      if (nextStep) {
        // Set the next step as current
        await this.dbService.updateWorkflowCurrentStep(workflow.id, nextStep.id);
        await this.dbService.updateStep(nextStep.id, { status: StepStatus.IN_PROGRESS });
        
        // Return the next step's prompt as part of the response
        return {
          response: `${aiResponse}\n\n${nextStep.prompt || 'Please provide the required information.'}`,
          nextStep,
          isComplete
        };
      } else {
        // No more steps, complete the workflow
        await this.dbService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
        return {
          response: aiResponse,
          isComplete: true
        };
      }
    } catch (error) {
      logger.error('Error handling step response:', error);
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
} 