import {db} from "../db";
import {workflows, workflowSteps, workflowTemplates} from "../db/schema";
import {eq} from "drizzle-orm";
import {
  Workflow,
  WorkflowStep,
  WorkflowTemplate,
  StepStatus,
  WorkflowStatus,
  StepType,
} from "../types/workflow";
import logger from "../utils/logger";

export class WorkflowDBService {
  // Template Operations
  async createTemplate(template: Omit<WorkflowTemplate, 'id'>): Promise<WorkflowTemplate> {
    const [newTemplate] = await db
      .insert(workflowTemplates)
      .values({
        ...template,
        steps: JSON.stringify(template.steps),
      })
      .returning();

    return {
      ...newTemplate,
      steps: template.steps,
    } as WorkflowTemplate;
  }

  async getTemplate(id: string): Promise<WorkflowTemplate | null> {
    const template = await db.query.workflowTemplates.findFirst({
      where: eq(workflowTemplates.id, id),
    });

    if (!template) return null;
    
    // Handle both string and object types for steps
    const steps = typeof template.steps === 'string' 
      ? JSON.parse(template.steps)
      : template.steps;

    return {
      ...template,
      steps,
    } as WorkflowTemplate;
  }

  async getTemplateByName(name: string): Promise<WorkflowTemplate | null> {
    const template = await db.query.workflowTemplates.findFirst({
      where: eq(workflowTemplates.name, name),
    });

    if (!template) return null;
    
    // Handle both string and object types for steps
    const steps = typeof template.steps === 'string' 
      ? JSON.parse(template.steps)
      : template.steps;

    return {
      ...template,
      steps,
    } as WorkflowTemplate;
  }

  // Workflow Operations
  async createWorkflow(workflow: Omit<Workflow, "id" | "createdAt" | "updatedAt" | "steps">): Promise<Workflow> {
    const [newWorkflow] = await db
      .insert(workflows)
      .values(workflow)
      .returning();

    return newWorkflow as Workflow;
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, id),
      with: {
        steps: true,
      },
    });

    if (!workflow) return null;
    return workflow as Workflow;
  }

  async getWorkflowByThreadId(threadId: string): Promise<Workflow | null> {
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.threadId, threadId),
      with: {
        steps: true,
      },
    });

    if (!workflow) return null;
    return workflow as Workflow;
  }

  async updateWorkflowStatus(id: string, status: WorkflowStatus): Promise<void> {
    await db
      .update(workflows)
      .set({status})
      .where(eq(workflows.id, id));
  }

  // Step Operations
  async createStep(step: Omit<WorkflowStep, "id" | "createdAt" | "updatedAt">): Promise<WorkflowStep> {
    const [newStep] = await db
      .insert(workflowSteps)
      .values(step)
      .returning();

    return newStep as WorkflowStep;
  }

  async getStep(id: string): Promise<WorkflowStep | null> {
    const step = await db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, id),
    });

    if (!step) return null;
    return step as WorkflowStep;
  }

  async updateStep(
    id: string,
    data: Partial<Omit<WorkflowStep, "id" | "workflowId" | "createdAt" | "updatedAt">>
  ): Promise<WorkflowStep> {
    const [updatedStep] = await db
      .update(workflowSteps)
      .set(data)
      .where(eq(workflowSteps.id, id))
      .returning();

    return updatedStep as WorkflowStep;
  }

  async deleteStep(id: string): Promise<void> {
    await db
      .delete(workflowSteps)
      .where(eq(workflowSteps.id, id));
  }

  async deleteWorkflow(id: string): Promise<void> {
    // Delete all steps associated with the workflow
    await db
      .delete(workflowSteps)
      .where(eq(workflowSteps.workflowId, id));

    // Delete the workflow
    await db
      .delete(workflows)
      .where(eq(workflows.id, id));
  }

  async updateWorkflowCurrentStep(workflowId: string, stepId: string | null): Promise<void> {
    logger.info('Updating workflow current step', {
      workflowId,
      stepId
    });

    await db.update(workflows)
      .set({
        currentStepId: stepId,
        updatedAt: new Date()
      })
      .where(eq(workflows.id, workflowId));
  }
} 