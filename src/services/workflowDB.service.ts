import {db} from "../db";
import {workflows, workflowSteps, workflowTemplates} from "../db/schema";
import {eq, asc} from "drizzle-orm";
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
  async createTemplate(template: Omit<WorkflowTemplate, 'id'> | WorkflowTemplate): Promise<WorkflowTemplate> {
    // Use template.id if provided, otherwise generate a new UUID
    const templateId = (template as any).id || (await import('crypto')).randomUUID();
    
    // Destructure the template to exclude the 'id' if it exists
    const { id, ...templateData } = template as any; 

    // Log the ID being used
    console.log(`Creating template with ID: ${templateId}`);

    const [newTemplate] = await db
      .insert(workflowTemplates)
      .values({
        id: templateId, // Use the provided or generated ID
        ...templateData, // Use the rest of the data 
        steps: JSON.stringify(templateData.steps), 
      })
      .returning();

    return {
      ...newTemplate,
      steps: templateData.steps, // Use steps from templateData
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
    // The templateId should now be a proper UUID passed from WorkflowService
    // No need to convert or generate UUIDs here
    
    logger.info(`Creating workflow with templateId: ${workflow.templateId}`);
    
    const [newWorkflow] = await db
      .insert(workflows)
      .values(workflow)
      .returning();

    // Return the basic workflow object with a steps array
    return { ...newWorkflow, steps: [] } as Workflow;
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    logger.info(`DB: Getting workflow record for ID: ${id}`); 
    // 1. Fetch the workflow record WITHOUT steps initially
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, id),
    });

    if (!workflow) {
        logger.warn(`DB: Workflow record not found with ID: ${id}`);
        return null;
    }

    // 2. Fetch the steps separately using an explicit WHERE clause
    logger.info(`DB: Fetching steps explicitly for workflow ID: ${id}`);
    const steps = await db.query.workflowSteps.findMany({
        where: eq(workflowSteps.workflowId, id), // <<< Explicit WHERE clause
        orderBy: [asc(workflowSteps.order)]
    });

    logger.info(`DB: Found ${steps?.length || 0} steps for workflow ${id}.`);
    
    // 3. Combine the workflow record and the correctly filtered steps
    return { ...workflow, steps: steps || [] } as Workflow;
  }

  async getWorkflowsByThreadId(threadId: string): Promise<Workflow[]> {
     logger.info(`DB: Getting all workflow records for thread ID: ${threadId}`);
    // 1. Fetch workflow records WITHOUT steps
    const workflowRecords = await db.query.workflows.findMany({
      where: eq(workflows.threadId, threadId),
      orderBy: (workflows, { asc }) => [asc(workflows.createdAt)] 
    });

    if (!workflowRecords || workflowRecords.length === 0) {
        return [];
    }

    logger.info(`DB: Found ${workflowRecords.length} workflow records for thread ${threadId}. Fetching steps for each...`);
    const workflowsWithSteps: Workflow[] = [];
    // 2. Loop and fetch steps separately for EACH workflow ID
    for (const wf of workflowRecords) {
        const steps = await db.query.workflowSteps.findMany({
            where: eq(workflowSteps.workflowId, wf.id), // <<< Explicit WHERE clause per workflow
            orderBy: [asc(workflowSteps.order)]
        });
        workflowsWithSteps.push({ ...wf, steps: steps || [] } as Workflow);
        logger.info(`DB: Fetched ${steps?.length || 0} steps for workflow ${wf.id}`);
    }

    return workflowsWithSteps;
  }

  async updateWorkflowStatus(id: string, status: WorkflowStatus): Promise<void> {
     logger.info(`Updating workflow ${id} status to: ${status}`);
    await db
      .update(workflows)
      .set({status, updatedAt: new Date()}) // Also update updatedAt
      .where(eq(workflows.id, id));
  }

  // Step Operations
  async createStep(step: Omit<WorkflowStep, "id" | "createdAt" | "updatedAt">): Promise<WorkflowStep> {
     logger.info(`DB: Attempting to create step for workflow ${step.workflowId} with name: ${step.name}`);
     // Use JSON.stringify for nested objects in logs
     logger.info(`DB: Create Step Input Data: ${JSON.stringify({ workflowId: step.workflowId, name: step.name, prompt: step.prompt, order: step.order, status: step.status })}`); 

    // Convert the step type to a string that matches the enum values in the schema
    const stepTypeAsString = step.stepType.toString();
    
    // Create values object with converted stepType
    const insertValues = {
      ...step,
      stepType: stepTypeAsString as any, // Cast to any to bypass type checking
    };

    const [newStep] = await db
      .insert(workflowSteps)
      .values(insertValues)
      .returning();
    
    if (!newStep) {
      logger.error(`DB: Failed to create step for workflow ${step.workflowId}. Insert returned null/undefined.`);
      throw new Error(`Failed to create step for workflow ${step.workflowId}`);
    }
    logger.info(`DB: Step created successfully with ID: ${newStep.id}`);
     // Use JSON.stringify for nested objects in logs
    logger.info(`DB: Create Step Returned Data: ${JSON.stringify({ id: newStep.id, workflowId: newStep.workflowId, name: newStep.name, prompt: newStep.prompt, order: newStep.order, status: newStep.status })}`);

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
    data: Partial<Omit<WorkflowStep, "id" | "workflowId" | "createdAt">> // Don't allow setting updatedAt directly
  ): Promise<WorkflowStep> {
    // Handle stepType conversion if present in the data
    let convertedData: any = { ...data };
    
    // If stepType is provided, convert it to string
    if (data.stepType !== undefined) {
      convertedData.stepType = data.stepType.toString();
    }
    
    const updateData = {
      ...convertedData,
      updatedAt: new Date() // Set updatedAt timestamp
    };

    const [updatedStep] = await db
      .update(workflowSteps)
      .set(updateData)
      .where(eq(workflowSteps.id, id))
      .returning();

    if (!updatedStep) {
      logger.error(`Failed to update step ${id}. Step not found or update failed.`);
      throw new Error(`Failed to update step ${id}`);
    }

    return updatedStep as WorkflowStep;
  }

  async deleteStep(id: string): Promise<void> {
    await db
      .delete(workflowSteps)
      .where(eq(workflowSteps.id, id));
  }

  async deleteWorkflow(id: string): Promise<void> {
    logger.warn(`Deleting workflow ${id} and its associated steps.`);
    // Delete all steps associated with the workflow first
    const deletedSteps = await db
      .delete(workflowSteps)
      .where(eq(workflowSteps.workflowId, id))
      .returning({ id: workflowSteps.id }); // Get IDs of deleted steps
    logger.warn(`Deleted ${deletedSteps.length} steps for workflow ${id}.`);

    // Then delete the workflow
    await db
      .delete(workflows)
      .where(eq(workflows.id, id));
     logger.warn(`Deleted workflow ${id}.`);
  }

  async updateWorkflowCurrentStep(workflowId: string, stepId: string | null): Promise<void> {
    logger.info(`Updating workflow ${workflowId} current step ID to: ${stepId}`);

    await db.update(workflows)
      .set({
        currentStepId: stepId,
        updatedAt: new Date()
      })
      .where(eq(workflows.id, workflowId));
  }
} 