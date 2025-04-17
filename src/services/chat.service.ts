import { db } from "../db";
import { chatThreads, chatMessages } from "../db/schema";
import { WorkflowService } from "./workflow.service";
import { WorkflowStatus, StepStatus } from "../types/workflow";
import { eq } from "drizzle-orm";

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
    // Add user message to thread
    await this.addMessage(threadId, content, true);

    // Get active workflow for thread
    const workflow = await this.workflowService.getWorkflowByThreadId(threadId);
    if (!workflow) {
      // If no workflow, start a new one
      const template = await this.workflowService.getTemplateByName("Launch Announcement");
      if (!template) {
        throw new Error("Template not found");
      }
      await this.workflowService.createWorkflow(threadId, template.id);
      return this.getNextPrompt(threadId);
    }

    // If workflow exists, handle the current step
    if (workflow.currentStepId) {
      const response = await this.workflowService.handleStepResponse(workflow.currentStepId, content);
      
      if (response.isComplete) {
        return this.generateFinalResponse(workflow);
      }

      // Add AI response to thread if provided
      if (response.response) {
        await this.addMessage(threadId, response.response, false);
      }

      return response.response;
    }

    // If no current step, get the next one
    return this.getNextPrompt(threadId);
  }

  private async getNextPrompt(threadId: string) {
    const workflow = await this.workflowService.getWorkflowByThreadId(threadId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    // If there's no current step, get the first pending step
    if (!workflow.currentStepId) {
      const nextStep = workflow.steps.find(step => step.status === StepStatus.PENDING);
      if (!nextStep) {
        throw new Error("No next step found");
      }

      // Set this as the current step
      await this.workflowService.updateStep(nextStep.id, { status: StepStatus.IN_PROGRESS });
      await this.workflowService.updateWorkflowCurrentStep(workflow.id, nextStep.id);

      const prompt = nextStep.prompt || "Please provide the required information.";
      await this.addMessage(threadId, prompt, false);
      return prompt;
    }

    // Get the current step
    const currentStep = workflow.steps.find(step => step.id === workflow.currentStepId);
    if (!currentStep) {
      throw new Error("Current step not found");
    }

    // If current step is complete, get the next pending step
    if (currentStep.status === StepStatus.COMPLETE) {
      const nextStep = workflow.steps.find(step => 
        step.status === StepStatus.PENDING && 
        step.order > currentStep.order &&
        step.dependencies.every(dep => 
          workflow.steps.find(s => s.name === dep)?.status === StepStatus.COMPLETE
        )
      );

      if (!nextStep) {
        throw new Error("No next step found");
      }

      // Set this as the current step
      await this.workflowService.updateStep(nextStep.id, { status: StepStatus.IN_PROGRESS });
      await this.workflowService.updateWorkflowCurrentStep(workflow.id, nextStep.id);

      const prompt = nextStep.prompt || "Please provide the required information.";
      await this.addMessage(threadId, prompt, false);
      return prompt;
    }

    // Return the current step's prompt
    const prompt = currentStep.prompt || "Please provide the required information.";
    await this.addMessage(threadId, prompt, false);
    return prompt;
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