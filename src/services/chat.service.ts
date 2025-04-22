import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { WorkflowService } from "./workflow.service";
import { WorkflowStatus, StepStatus } from "../types/workflow";
import { eq } from "drizzle-orm";
import { BASE_WORKFLOW_TEMPLATE } from '../templates/workflows/base-workflow.js';

export class ChatService {
  private workflowService: WorkflowService;

  constructor() {
    this.workflowService = new WorkflowService();
  }

  async createThread(userId: string, title: string) {
    const [thread] = await db
      .insert(chatThreads)
      .values({
        userId,
        title,
      })
      .returning();
    return thread;
  }

  async addMessage(threadId: string, content: string, isUser: boolean) {
    const [message] = await db
      .insert(chatMessages)
      .values({
        threadId,
        content,
        role: isUser ? "user" : "assistant",
        userId: "system", // This should be replaced with actual user ID in production
      })
      .returning();
    return message;
  }

  async getThreadMessages(threadId: string) {
    return db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    });
  }

  async handleUserMessage(threadId: string, content: string) {
    await this.addMessage(threadId, content, true);

    // Get the *most recently active* workflow, including potentially the Base workflow
    // Let's adjust the logic slightly - maybe fetch all and determine active?
    // Or, let's try fetching the Base first if applicable.
    let workflow = await this.workflowService.getWorkflowByThreadId(threadId); // Tries to get non-base first
    if (!workflow) {
       // If no non-base workflow, check if Base exists and is active
       const baseWorkflow = await this.workflowService.getBaseWorkflowByThreadId(threadId);
       if (baseWorkflow && baseWorkflow.status === WorkflowStatus.ACTIVE) {
           workflow = baseWorkflow;
       }
    }


    // If still no workflow (neither non-base active nor base active), create the Base workflow
    if (!workflow) {
      const baseTemplate = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name);
      if (!baseTemplate) throw new Error("Base workflow template not found");
      
      const newWorkflow = await this.workflowService.createWorkflow(threadId, baseTemplate.id);
      // Get the first prompt for the newly created Base workflow
      return this.getNextPrompt(threadId, newWorkflow.id);
    }

    // If we have an active workflow, process the current step
    const currentStepId = workflow.currentStepId;
    if (!currentStepId) {
      // This might happen if a workflow was somehow left without a current step
      // Or potentially right after creation before the first prompt call?
      console.warn(`Workflow ${workflow.id} has no currentStepId. Attempting to get next prompt.`);
      return this.getNextPrompt(threadId, workflow.id);
    }

    // Handle the step response using the current step ID
    const stepResponse = await this.workflowService.handleStepResponse(currentStepId, content);
    
    // Add AI response to thread if provided by handleStepResponse
    if (stepResponse.response && stepResponse.response !== 'Workflow completed successfully.') { // Avoid duplicate completion message
      await this.addMessage(threadId, stepResponse.response, false);
    }

    // Check if the *workflow* completed as a result of this step
    if (stepResponse.isComplete) {
        // --- START: Workflow Transition Logic ---
        
        // Check if the completed workflow was the Base Workflow
        // Now we need the actual BASE_WORKFLOW_TEMPLATE *object* to compare its name/ID if needed,
        // OR we can just fetch the template by name without the constant here.
        // Let's fetch by name directly to avoid relying on the imported constant within this specific check.
        const baseTemplateFromDB = await this.workflowService.getTemplateByName(BASE_WORKFLOW_TEMPLATE.name); // Use constant only for getting name initially if needed

        // Check if the completed workflow's template ID matches the base template ID from DB
        if (workflow.templateId === baseTemplateFromDB?.id) { // Compare IDs
            console.log('Base workflow completed. Checking for next workflow selection...');
            // Retrieve the completed Base Workflow details to find the selection
            const completedBaseWorkflow = await this.workflowService.getWorkflow(workflow.id); 
            const selectionStep = completedBaseWorkflow?.steps.find(s => s.name === "Workflow Selection");
            const selectedWorkflowName = selectionStep?.userInput;

            if (selectedWorkflowName) {
                console.log(`User selected: ${selectedWorkflowName}`);
                const nextTemplate = await this.workflowService.getTemplateByName(selectedWorkflowName);
                
                if (nextTemplate) {
                    console.log(`Found template for "${selectedWorkflowName}". Creating next workflow...`);
                    try {
                        // Create the *new* selected workflow
                        const nextWorkflow = await this.workflowService.createWorkflow(threadId, nextTemplate.id);
                        console.log(`Created workflow ${nextWorkflow.id} for template ${nextTemplate.name}`);
                        // Get the *first prompt* of the NEW workflow
                        return this.getNextPrompt(threadId, nextWorkflow.id); 
                    } catch (creationError) {
                        console.error(`Error creating workflow for ${selectedWorkflowName}:`, creationError);
                        const errorMsg = `Sorry, I couldn't start the ${selectedWorkflowName} workflow.`;
                        await this.addMessage(threadId, errorMsg, false);
                        return errorMsg;
                    }
                } else {
                    console.warn(`Template not found for selection: ${selectedWorkflowName}`);
                    const notFoundMsg = `Sorry, I couldn't find a workflow template named "${selectedWorkflowName}".`;
                    await this.addMessage(threadId, notFoundMsg, false);
                    return notFoundMsg;
                }
            } else {
                console.warn('Could not determine next workflow from Base Workflow selection step.');
                // Fall through to generic completion message if selection wasn't found
            }
        }
        
        // If it wasn't the base workflow, or if base completed without valid selection, just confirm completion.
        const completionMsg = `${workflow.templateId || 'Workflow'} completed successfully.`; // Use template name if possible
        // Ensure completion message wasn't already added by handleStepResponse if its response was used
         const lastMessage = await this.getLastMessage(threadId);
         if (lastMessage?.content !== completionMsg) {
             await this.addMessage(threadId, completionMsg, false);
         }
        return completionMsg;

        // --- END: Workflow Transition Logic ---

    } else if (stepResponse.nextStep) {
      // If the workflow is not complete, but there's a specific next step prompt from handleStepResponse
       const nextPrompt = stepResponse.nextStep.prompt || "Please provide the required information.";
       // Add the prompt message if it's not the same as the stepResponse message already added
        if (stepResponse.response !== nextPrompt) {
           await this.addMessage(threadId, nextPrompt, false);
        }
       return nextPrompt; 
    } else {
       // If the step isn't complete and handleStepResponse didn't provide a specific next step/prompt,
       // rely on getNextPrompt to figure out what to do (e.g., re-prompt for current step if needed)
       console.warn(`Step ${currentStepId} processed, workflow not complete, but handleStepResponse provided no next step. Calling getNextPrompt.`);
       return this.getNextPrompt(threadId, workflow.id);
    }
  }

  // Update getNextPrompt to accept workflowId
  private async getNextPrompt(threadId: string, workflowId: string) {
    const workflow = await this.workflowService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found for ID: ${workflowId}`);
    }

    let nextStep: any = null; // Use 'any' temporarily if WorkflowStep type is complex

    // Find the current step or the next pending step
    const currentStep = workflow.steps.find(step => step.id === workflow.currentStepId);

    if (currentStep && currentStep.status !== StepStatus.COMPLETE) {
        // If current step exists and is not complete, it's the next step.
        nextStep = currentStep;
    } else {
       // Find the first pending step whose dependencies are met
       const pendingSteps = workflow.steps
         .filter(step => step.status === StepStatus.PENDING)
         .sort((a, b) => a.order - b.order);

       for (const step of pendingSteps) {
         const dependenciesMet = step.dependencies.every(depName => {
           const depStep = workflow.steps.find(s => s.name === depName);
           return depStep?.status === StepStatus.COMPLETE;
         });
         if (dependenciesMet) {
           nextStep = step;
           break;
         }
       }
    }


      if (!nextStep) {
       // Check if all steps are complete
       const allStepsComplete = workflow.steps.every(step => step.status === StepStatus.COMPLETE);
       if(allStepsComplete && workflow.status !== WorkflowStatus.COMPLETED) {
           await this.workflowService.updateWorkflowStatus(workflow.id, WorkflowStatus.COMPLETED);
           const workflowCompleteMsg = `${workflow.templateId || 'Workflow'} completed.`;
            await this.addMessage(threadId, workflowCompleteMsg, false);
           return workflowCompleteMsg;
       } else {
          const noStepsMsg = "No further steps available or dependencies not met.";
          await this.addMessage(threadId, noStepsMsg, false);
          return noStepsMsg;
       }
    }

    // If the next step is different from current or not yet IN_PROGRESS, update status
    if (nextStep.id !== workflow.currentStepId || nextStep.status !== StepStatus.IN_PROGRESS) {
      await this.workflowService.updateStep(nextStep.id, { status: StepStatus.IN_PROGRESS });
      await this.workflowService.updateWorkflowCurrentStep(workflow.id, nextStep.id);
    }


      const prompt = nextStep.prompt || "Please provide the required information.";
    // Avoid adding duplicate prompts if the step didn't change
    const lastMessage = await this.getLastMessage(threadId);
    if (lastMessage?.content !== prompt || lastMessage?.role !== 'assistant') {
      await this.addMessage(threadId, prompt, false);
    }
      return prompt;
    }

  // Helper to get the last message (you might need to implement this or similar)
  private async getLastMessage(threadId: string) {
     const messages = await db.query.chatMessages.findMany({
        where: eq(chatMessages.threadId, threadId),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 1,
     });
     return messages[0] || null;
  }

  private async generateFinalResponse(workflow: any) {
    // Get steps in order
    const orderedSteps = workflow.steps.sort((a: any, b: any) => a.order - b.order);

    // Find the relevant steps and their responses
    const initialGoal = orderedSteps.find((s: any) => s.order === 0)?.aiSuggestion || '';
    const targetAudience = orderedSteps.find((s: any) => s.order === 1)?.userInput || '';
    const keyFeatures = orderedSteps.find((s: any) => s.order === 2)?.userInput || '';
    const valueProposition = orderedSteps.find((s: any) => s.order === 3)?.userInput || '';
    const callToAction = orderedSteps.find((s: any) => s.order === 4)?.userInput || '';

    const announcement = `We're excited to announce our new product launch!

Target Audience:
${targetAudience}

Key Features:
${keyFeatures}

Value Proposition:
${valueProposition}

${callToAction}

Join us on this exciting journey!`;

    await this.addMessage(workflow.threadId, announcement, false);
    return announcement;
  }
} 